/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.chesscomfiles.com",
      },
      {
        protocol: "https",
        hostname: "www.chess.com",
      },
    ],
  },
};

export default nextConfig;
