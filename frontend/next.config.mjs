/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.API_BASE ?? "http://localhost:8000/:path*",
      },
    ];
  },
};
export default nextConfig;  // <- ESM export
