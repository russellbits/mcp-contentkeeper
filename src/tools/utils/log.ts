const ts = () => new Date().toISOString();

export const log = {
  info: (msg: string) => process.stderr.write(`[INFO]  ${ts()} ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[ERROR] ${ts()} ${msg}\n`),
};
