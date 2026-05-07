/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow contracts package to live outside .next bundling concerns.
  transpilePackages: ['@ai-workflow/contracts'],
};

export default nextConfig;
