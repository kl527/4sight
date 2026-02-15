package expo.modules.modules

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMetaGlassesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMetaGlasses")

    Events(
      "onRegistrationStateChanged",
      "onDevicesChanged",
      "onStreamingStatusChanged",
      "onCaptionReceived",
      "onPreviewFrame"
    )

    // The Meta Wearables SDK integration is iOS-only in this repository.
    // Keep Android methods present so JS startup doesn't crash when module is loaded.
    AsyncFunction("configure") {}

    AsyncFunction("startRegistration") {
      throw IllegalStateException("ExpoMetaGlasses is currently only supported on iOS.")
    }

    AsyncFunction("stopRegistration") {}

    AsyncFunction("handleUrl") { _: String -> }

    AsyncFunction("startStreaming") { _: String, _: String ->
      throw IllegalStateException("ExpoMetaGlasses streaming is currently only supported on iOS.")
    }

    AsyncFunction("stopStreaming") {}
  }
}
