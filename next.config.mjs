/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      "exceljs",
      "jspdf",
      "openai",
      "pdf-parse",
      "tesseract.js",
      "xlsx"
    ]
  }
};

export default nextConfig;
