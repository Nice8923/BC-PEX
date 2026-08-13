import js from '@eslint/js';
import globals from 'globals';

// Bondage Club 运行期全局：列成 readonly，这样 no-undef 才能抓出真正漏掉的
// 跨模块 import（否则 Rollup 会把那些符号当成全局悄悄放过）。
const bcGlobals = [
  'Player', 'ChatRoomCharacter', 'CurrentScreen', 'CurrentTime', 'CurrentModule',
  'CharacterSetFacialExpression', 'CharacterNickname', 'CharacterRefresh',
  'CharacterLoadCanvas', 'WardrobeGetExpression', 'PoseRefresh',
  'ChatRoomCharacterUpdate', 'ChatRoomCharacterExpressionUpdate',
  'ChatRoomCharacterViewDrawOverlay', 'ChatRoomHideIconState', 'ChatRoomRun',
  'ChatRoomLeave', 'ChatRoomMessage', 'ChatRoomSendChat', 'ChatRoomTargetMemberNumber',
  'MainCanvas', 'DrawButton', 'DrawText', 'DrawRect', 'DrawImageResize', 'DrawCharacter',
  'MouseIn', 'InventoryGet', 'InventoryWear', 'InventoryRemove',
  'ActivityCheckPrerequisites', 'ActivityDictionaryText', 'DialogActivityClick',
  'ServerSend', 'ServerSendQueueProcess', 'ServerAccountUpdate', 'ServerIsLoggedIn',
  'ServerPlayerExtensionSettingsSync', 'ServerPlayerIsInChatRoom',
  'InformationSheetRun', 'InformationSheetClick', 'InformationSheetExit',
  'InformationSheetSelection', 'PreferenceRegisterExtensionSetting', 'PreferenceExit',
  'PreferenceSubscreenExtensionsOpen', 'CommandCombine', 'TextQueryMultiple',
  'LZString', 'bcModSdk', 'AudioPlaySoundEffect',
  'DialogActivity', 'DialogMenuMapping', 'DialogLeave',
  'ElementCreateInput', 'ElementValue', 'ElementRemove',
];

export default [
  { ignores: ['dist/**', 'node_modules/**', 'loader*.user.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...Object.fromEntries(bcGlobals.map(g => [g, 'readonly'])),
        __PEX_VERSION__: 'readonly',
      },
    },
    rules: {
      // 全项目的惯用写法是 try{...}catch(e){} 静默兜底，catch 参数不用是故意的
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
      // UI 文案里的全角空格 U+3000 是排版用的，模板字串里放行
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
    },
  },
  {
    // 建置脚本跑在 Node
    files: ['*.config.js', 'scripts/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
];
