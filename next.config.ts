import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The local preview is commonly opened through the machine's LAN address.
  // Without this, Next.js dev blocks client chunks and the page never hydrates.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.50.251"],
};

export default nextConfig;
