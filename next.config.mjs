/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Tree-shake sâu các thư viện barrel-export nặng -> giảm JS tải về
    optimizePackageImports: ['recharts', 'lucide-react'],
    // Router cache phía client: quay lại trang vừa xem trong 60s
    // KHÔNG refetch -> chuyển trang qua menu nhanh tức thì.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
}

export default nextConfig
