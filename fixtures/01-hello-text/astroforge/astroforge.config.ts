import type { AstroForgePluginOptions } from '@astralsight/astroforge-rsbuild-plugin';

// fixture 01 的 AstroForge 项目配置。
//
// 仅声明应用元信息——pages 由插件自动发现 src/pages/** 得到。
export default {
  manifest: {
    package: 'com.astroforge.fixture.hello',
    name: 'fixture-01-hello-text',
    versionName: '1.0.0',
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: '/common/logo.png',
    deviceTypeList: ['watch'],
    config: { logLevel: 'log', designWidth: 'device-width' },
  },
  plugin: {
    target: 'vela',
  } satisfies AstroForgePluginOptions,
};
