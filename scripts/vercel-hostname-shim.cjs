// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS 셸 프리로드 스크립트
const os = require("node:os");

os.hostname = () => "codex-host";
