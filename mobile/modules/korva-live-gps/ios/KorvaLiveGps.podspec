Pod::Spec.new do |s|
  s.name = 'KorvaLiveGps'
  s.version = '1.0.0'
  s.summary = 'Korva GPS Live Activity'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Korva'
  s.homepage = 'https://korva.run'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.source_files = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ActivityKit'
  s.static_framework = true
end
