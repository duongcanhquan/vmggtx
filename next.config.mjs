/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tree-shake sâu các thư viện barrel-export nặng -> giảm JS tải về
  experimental: {
    optimizePackageImports: ['recharts', 'lucide-react'],
  },
}

export default nextConfig
