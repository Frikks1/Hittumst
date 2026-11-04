const fs = require('node:fs');
const path = require('node:path');

// EAS file variables provide the configuration on the builder without committing it.
module.exports = ({ config }) => {
  const localFile = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(localFile) ? localFile : undefined);
  if (!googleServicesFile) return config;

  // EAS may resolve a file variable only on its remote builder.
  if (fs.existsSync(googleServicesFile)) {
    const firebase = JSON.parse(fs.readFileSync(googleServicesFile, 'utf8'));
    const matchesApp = firebase.client?.some(client =>
      client.client_info?.android_client_info?.package_name === config.android?.package);
    if (!matchesApp) throw new Error('Firebase Android configuration must match is.rummal.app.');
  }
  return { ...config, android: { ...config.android, googleServicesFile } };
};
