// Reexport the native module. On web, it will be resolved to ModulesModule.web.ts
// and on native platforms to ModulesModule.ts
export { default } from './src/ModulesModule';
export { default as ModulesView } from './src/ModulesView';
export * from  './src/Modules.types';
