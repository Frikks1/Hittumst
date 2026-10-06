// Build-only Windows drive-alias normalization. The alias and real root refer to
// exactly the same directory; this avoids mixed C:/H: paths from async realpath.
const fs = require('node:fs');
const path = require('node:path');
const real = process.env.HITTUMST_BUILD_REAL_ROOT;
const alias = process.env.HITTUMST_BUILD_ALIAS;
if (
  process.platform === 'win32' &&
  real &&
  alias &&
  path.isAbsolute(real) &&
  path.isAbsolute(alias)
) {
  const map = (value) => {
    if (typeof value !== 'string') return value;
    const relative = path.relative(real, value);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
      ? path.join(alias, relative)
      : value;
  };
  const original = fs.promises.realpath.bind(fs.promises);
  // Node's module resolver also canonicalizes paths, independently of fs.realpath.
  // Keep autolinking and native CMake inputs on the same short drive alias.
  const Module = require('node:module');
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (...args) {
    return map(resolveFilename.apply(this, args));
  };
  fs.promises.realpath = async (...args) => map(await original(...args));
  const sync = fs.realpathSync;
  const wrapped = (...args) => map(sync(...args));
  wrapped.native = (...args) => map(sync.native(...args));
  fs.realpathSync = wrapped;
  const asyncPath = fs.realpath;
  const wrapAsync = (method) => (filename, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    return method(filename, options, (error, value) => callback(error, error ? value : map(value)));
  };
  fs.realpath = wrapAsync(asyncPath);
  fs.realpath.native = wrapAsync(asyncPath.native);
}
