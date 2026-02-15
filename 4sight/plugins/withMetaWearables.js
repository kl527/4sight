const { withPodfile } = require('@expo/config-plugins');

const META_DAT_FUNCTION = `
def ensure_meta_dat_swift_package_for_modules_target(installer)
  pods_project = installer.pods_project
  modules_target = pods_project.targets.find { |target| target.name == 'Modules' }
  return unless modules_target

  package_url = 'https://github.com/facebook/meta-wearables-dat-ios'
  package_ref = pods_project.root_object.package_references.find do |ref|
    ref.isa == 'XCRemoteSwiftPackageReference' && ref.repositoryURL == package_url
  end

  unless package_ref
    package_ref = pods_project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
    package_ref.repositoryURL = package_url
    package_ref.requirement = {
      'kind' => 'upToNextMajorVersion',
      'minimumVersion' => '0.4.0',
    }
    pods_project.root_object.package_references << package_ref
  end

  %w[MWDATCore MWDATCamera].each do |product_name|
    product_dependency = modules_target.package_product_dependencies.find do |dependency|
      dependency.product_name == product_name
    end

    unless product_dependency
      product_dependency = pods_project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
      product_dependency.package = package_ref
      product_dependency.product_name = product_name
      modules_target.package_product_dependencies << product_dependency
    end

    has_framework_link = modules_target.frameworks_build_phase.files.any? do |build_file|
      build_file.product_ref&.product_name == product_name
    end
    next if has_framework_link

    build_file = pods_project.new(Xcodeproj::Project::Object::PBXBuildFile)
    build_file.product_ref = product_dependency
    modules_target.frameworks_build_phase.files << build_file
  end
end
`;

module.exports = function withMetaWearables(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    // Add the function definition before the first ENV line
    if (!contents.includes('ensure_meta_dat_swift_package_for_modules_target')) {
      contents = contents.replace(
        /^(ENV\['RCT_NEW_ARCH_ENABLED)/m,
        META_DAT_FUNCTION + '\n$1'
      );

      // Add the function call inside post_install, after the react_native_post_install block
      contents = contents.replace(
        /(\n  end\nend)\s*$/,
        '\n\n    ensure_meta_dat_swift_package_for_modules_target(installer)$1'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
