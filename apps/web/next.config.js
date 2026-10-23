/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@edunet/ui', '@edunet/auth', '@edunet/api-client'],
};

module.exports = nextConfig;
