import ExpoModulesCore
import MWDATCore
import MWDATCamera

public class ExpoMetaGlassesModule: Module {
  private var webSocket: URLSessionWebSocketTask?
  private var streamSession: StreamSession?
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
      try Wearables.configure()
    }

    AsyncFunction("startRegistration") {
      try Wearables.shared.startRegistration()
      self.observeRegistrationState()
      self.observeDevices()
    }

    AsyncFunction("stopRegistration") {
      try Wearables.shared.startUnregistration()
    }

    AsyncFunction("handleUrl") { (urlString: String) in
      guard let url = URL(string: urlString) else { return }
      try await Wearables.shared.handleUrl(url)
    }

    AsyncFunction("startStreaming") { (deviceId: String, wsUrl: String) in
      guard !self.isStreaming else { return }

      self.sendEvent("onStreamingStatusChanged", ["status": "starting"])

      do {
        // Find the device
        guard let device = Wearables.shared.devices.first(where: { $0.identifier == deviceId }) else {
          self.sendEvent("onStreamingStatusChanged", ["status": "error"])
          return
        }

        // Create stream session
        let config = StreamSessionConfig(resolution: .r720p, codec: .h264)
        let session = StreamSession(device: device, config: config)
        self.streamSession = session

        // Open WebSocket
        let url = URL(string: wsUrl)!
        let wsSession = URLSession(configuration: .default)
        let ws = wsSession.webSocketTask(with: url)
        ws.resume()
        self.webSocket = ws
        self.isStreaming = true
        self.frameCount = 0

        // Start streaming
        try await session.start()
        self.sendEvent("onStreamingStatusChanged", ["status": "streaming"])

        // Listen for WS acks in background
        self.listenForWsMessages()

        // Process video frames
        for await frame in session.videoFrames() {
          guard self.isStreaming else { break }

          let frameData = frame.data

          // Send binary frame over WebSocket
          let message = URLSessionWebSocketTask.Message.data(frameData)
          try await ws.send(message)

          // Every 10th frame, emit a preview thumbnail
          self.frameCount += 1
          if self.frameCount % 10 == 0 {
            self.emitPreviewThumbnail(from: frameData)
          }
        }
      } catch {
        self.isStreaming = false
        self.sendEvent("onStreamingStatusChanged", ["status": "error"])
      }
    }

    AsyncFunction("stopStreaming") {
      self.isStreaming = false
      try await self.streamSession?.stop()
      self.streamSession = nil
      self.webSocket?.cancel(with: .goingAway, reason: nil)
      self.webSocket = nil
      self.sendEvent("onStreamingStatusChanged", ["status": "stopped"])
    }
  }

  // MARK: - Registration & Device Observation

  private func observeRegistrationState() {
    Task {
      for await state in Wearables.shared.registrationStateStream() {
        self.sendEvent("onRegistrationStateChanged", ["state": String(describing: state)])
      }
    }
  }

  private func observeDevices() {
    Task {
      for await devices in Wearables.shared.devicesStream() {
        let mapped = devices.map { d in
          ["id": d.identifier, "name": d.name, "modelName": d.modelName]
        }
        self.sendEvent("onDevicesChanged", ["devices": mapped])
      }
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

  private func emitPreviewThumbnail(from frameData: Data) {
    guard let image = UIImage(data: frameData) else { return }
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
}
