/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Tree-shake sâu các thư viện barrel-export nặng -> giảm JS tải về
    optimizePackageImports: ['recharts', 'lucide-react'],
    // Router cache phía client: quay lại trang vừa xem trong 30s
    // KHÔNG refetch -> chuyển trang qua menu nhanh tức thì.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
}

export default nextConfig
