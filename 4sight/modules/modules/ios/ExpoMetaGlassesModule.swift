import ExpoModulesCore
import MWDATCore
import MWDATCamera
import UIKit

public class ExpoMetaGlassesModule: Module {
  private var webSocket: URLSessionWebSocketTask?
  private var streamSession: StreamSession?
  private var videoFrameListenerToken: AnyListenerToken?
  private var frameCount: Int = 0
  private var isStreaming = false

  public func definition() -> ModuleDefinition {
    Name("ExpoMetaGlasses")

    Events(
      "onRegistrationStateChanged",
      "onDevicesChanged",
      "onStreamingStatusChanged",
      "onCaptionReceived",
      "onPreviewFrame"
    )

    AsyncFunction("configure") {
      do {
        try await MainActor.run { try Wearables.configure() }
        print("[MetaGlasses] configure() succeeded")
      } catch {
        print("[MetaGlasses] configure() failed: \(error) — \(String(describing: error))")
        throw error
      }
    }

    AsyncFunction("startRegistration") {
      do {
        print("[MetaGlasses] calling startRegistration()...")
        try await Wearables.shared.startRegistration()
        print("[MetaGlasses] startRegistration() succeeded")
        self.observeRegistrationState()
        self.observeDevices()
      } catch {
        print("[MetaGlasses] startRegistration() failed: \(error) — \(String(describing: error))")
        throw error
      }
    }

    AsyncFunction("stopRegistration") {
      try await Wearables.shared.startUnregistration()
    }

    AsyncFunction("handleUrl") { (urlString: String) in
      guard let url = URL(string: urlString) else { return }
      _ = try await Wearables.shared.handleUrl(url)
    }

    AsyncFunction("startStreaming") { (deviceId: String, wsUrl: String) in
      guard !self.isStreaming else { return }

      self.sendEvent("onStreamingStatusChanged", ["status": "starting"])

      do {
        // In DAT 0.4+, Wearables.shared.devices is [DeviceIdentifier] (String).
        guard let deviceIdentifier = Wearables.shared.devices.first(where: { $0 == deviceId }) else {
          self.sendEvent("onStreamingStatusChanged", ["status": "error"])
          return
        }

        // TODO: If this project is pinned to an older DAT SDK, migrate to this 0.4+ raw-frame API.
        let session = await MainActor.run {
          let config = StreamSessionConfig(
            videoCodec: VideoCodec.raw,
            resolution: StreamingResolution.low,
            frameRate: 3
          )
          let deviceSelector = SpecificDeviceSelector(device: deviceIdentifier)
          return StreamSession(streamSessionConfig: config, deviceSelector: deviceSelector)
        }
        self.streamSession = session

        let cameraStatus = try await Wearables.shared.checkPermissionStatus(.camera)
        if cameraStatus != .granted {
          let _ = try await Wearables.shared.requestPermission(.camera)
        }

        // Open WebSocket
        guard let url = URL(string: wsUrl) else {
          self.sendEvent("onStreamingStatusChanged", ["status": "error"])
          return
        }
        let wsSession = URLSession(configuration: .default)
        let ws = wsSession.webSocketTask(with: url)
        ws.resume()
        self.webSocket = ws
        self.isStreaming = true
        self.frameCount = 0

        self.videoFrameListenerToken = await MainActor.run {
          session.videoFramePublisher.listen { [weak self] frame in
            guard let self = self, self.isStreaming else { return }

            // TODO: If makeUIImage() is unavailable in the pinned SDK, map raw frame buffers to JPEG first.
            guard let image = frame.makeUIImage(), let jpegData = image.jpegData(compressionQuality: 0.65) else {
              return
            }

            self.frameCount += 1
            if self.frameCount % 10 == 0 {
              self.emitPreviewThumbnail(from: image)
            }

            Task {
              await self.sendFrameOverWebSocket(jpegData)
            }
          }
        }

        // Start streaming
        await session.start()
        self.sendEvent("onStreamingStatusChanged", ["status": "streaming"])

        // Listen for WS acks in background
        self.listenForWsMessages()
      } catch {
        await self.stopStreamingInternal(status: "error")
      }
    }

    AsyncFunction("stopStreaming") {
      await self.stopStreamingInternal(status: "stopped")
    }
  }

  // MARK: - Registration & Device Observation

  private func observeRegistrationState() {
    Task {
      for await state in Wearables.shared.registrationStateStream() {
        self.sendEvent("onRegistrationStateChanged", ["state": self.mapRegistrationState(state)])
      }
    }
  }

  private func observeDevices() {
    Task {
      for await deviceIds in Wearables.shared.devicesStream() {
        let mapped: [[String: String]] = deviceIds.map { deviceId in
          if let device = Wearables.shared.deviceForIdentifier(deviceId) {
            return [
              "id": deviceId,
              "name": device.nameOrId(),
              "modelName": device.deviceType().rawValue,
            ]
          }

          return [
            "id": deviceId,
            "name": deviceId,
            "modelName": DeviceType.unknown.rawValue,
          ]
        }
        self.sendEvent("onDevicesChanged", ["devices": mapped])
      }
    }
  }

  private func mapRegistrationState(_ state: RegistrationState) -> String {
    switch state {
    case .registered:
      return "registered"
    case .registering:
      return "registering"
    case .available, .unavailable:
      return "unregistered"
    @unknown default:
      return "unregistered"
    }
  }

  // MARK: - WebSocket Listener

  private func listenForWsMessages() {
    guard let ws = self.webSocket else { return }
    ws.receive { [weak self] result in
      guard let self = self, self.isStreaming else { return }
      switch result {
      case .success(let message):
        if case .string(let text) = message,
           let data = text.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let caption = json["caption"] as? String {
          let latencyMs = json["latency_ms"] as? Double ?? 0
          self.sendEvent("onCaptionReceived", ["caption": caption, "latencyMs": latencyMs])
        }
        // Continue listening
        self.listenForWsMessages()
      case .failure:
        break
      }
    }
  }

  // MARK: - Preview Thumbnail

  private func emitPreviewThumbnail(from image: UIImage) {
    let scale = 180.0 / max(image.size.width, 1)
    let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
    image.draw(in: CGRect(origin: .zero, size: newSize))
    let thumbnail = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    if let thumb = thumbnail, let jpegData = thumb.jpegData(compressionQuality: 0.5) {
      let base64 = jpegData.base64EncodedString()
      self.sendEvent("onPreviewFrame", ["base64": base64])
    }
  }

  private func sendFrameOverWebSocket(_ frameData: Data) async {
    guard self.isStreaming, let ws = self.webSocket else { return }

    do {
      let message = URLSessionWebSocketTask.Message.data(frameData)
      try await ws.send(message)
    } catch {
      await self.stopStreamingInternal(status: "error")
    }
  }

  private func stopStreamingInternal(status: String) async {
    self.isStreaming = false
    self.videoFrameListenerToken = nil
    await self.streamSession?.stop()
    self.streamSession = nil
    self.webSocket?.cancel(with: .goingAway, reason: nil)
    self.webSocket = nil
    self.sendEvent("onStreamingStatusChanged", ["status": status])
  }
}
