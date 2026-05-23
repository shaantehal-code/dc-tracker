/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push((context, callback) => {
        if (context.request === 'node:sqlite') {
          return callback(null, 'commonjs node:sqlite');
        }
        callback();
      });
    }
    return config;
  },
};

export default nextConfig;
