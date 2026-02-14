Pod::Spec.new do |s|
  s.name           = 'Modules'
  s.version        = '1.0.0'
  s.summary        = 'Expo module wrapping Meta Wearables DAT SDK'
  s.description    = 'Bridges Meta Ray-Ban glasses camera streaming to React Native'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.2' }
  s.source         = { git: '' }
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
