import type { Config } from 'tailwindcss'

// ============================================================
// LUXURY REMAP — "AURORA GLASS"
// Tông ngọc hiện đại: chàm hoàng gia (royal indigo) + tím thạch anh
// + vàng champagne, nền băng lam, bề mặt KÍNH MỜ (glassmorphism).
// Toàn bộ code cũ dùng indigo/violet/slate/amber... được remap về
// palette đã tinh chỉnh — đổi 1 chỗ là cả app đổi theo.
// ============================================================

/** Chàm hoàng gia — màu brand chính (remap indigo) */
const royal = {
  50: '#f0f3ff',
  100: '#e2e8fd',
  200: '#c9d4fb',
  300: '#a5b5f7',
  400: '#7e8ef0',
  500: '#5d68e8',
  600: '#4749da',
  700: '#3c3ac0',
  800: '#33319b',
  900: '#2e2e7b',
  950: '#1c1b4b',
}

/** Tím thạch anh — màu phụ (remap violet/purple) */
const amethyst = {
  50: '#f7f3ff',
  100: '#efe9fe',
  200: '#e1d6fe',
  300: '#c9b5fc',
  400: '#ad8bf8',
  500: '#925df2',
  600: '#833ce6',
  700: '#722bc7',
  800: '#6024a3',
  900: '#4f2085',
  950: '#32115c',
}

/** Vàng champagne — điểm nhấn quý (remap amber/yellow/gold) */
const gold = {
  50: '#fdf9ec',
  100: '#f9efcb',
  200: '#f3dd92',
  300: '#ecc75a',
  400: '#e5b136',
  500: '#d4941f',
  600: '#bc7118',
  700: '#965117',
  800: '#7b4019',
  900: '#693619',
  950: '#3c1b0a',
}

/** Mây lam — xám hiện đại pha lam nhẹ (remap slate/gray/stone) */
const cloud = {
  50: '#f8fafc',
  100: '#f1f4f9',
  200: '#e2e8f0',
  300: '#cbd6e4',
  400: '#94a3bb',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#080d1a',
}

/** Hồng ngọc thanh lịch — cảnh báo/lỗi (remap red/rose/pink) */
const rosewood = {
  50: '#fdf2f4',
  100: '#fce7ea',
  200: '#f9d0d9',
  300: '#f4a8b8',
  400: '#ec7591',
  500: '#df446d',
  600: '#ca2456',
  700: '#aa1848',
  800: '#8e1741',
  900: '#7a173d',
  950: '#44071e',
}

/** Cam mơ ấm — nhắc nhở (remap orange) */
const apricot = {
  50: '#fff7ed',
  100: '#ffedd4',
  200: '#fed8a8',
  300: '#fdbb71',
  400: '#fb9438',
  500: '#f97512',
  600: '#ea5a08',
  700: '#c24309',
  800: '#9a3510',
  900: '#7c2e10',
  950: '#431506',
}

/** Lam thiên thanh — thông tin (remap blue/sky/cyan) */
const azure = {
  50: '#eff7ff',
  100: '#dbecfe',
  200: '#bfdffe',
  300: '#93cbfd',
  400: '#60aefa',
  500: '#3b8df6',
  600: '#256feb',
  700: '#1d59d8',
  800: '#1e49af',
  900: '#1e408a',
  950: '#172954',
}

/** Ngọc lục bảo hiện đại — thành công (remap emerald/green/teal) */
const emerald = {
  50: '#ecfdf6',
  100: '#d1fae8',
  200: '#a7f3d5',
  300: '#6ee7bc',
  400: '#34d39e',
  500: '#10b981',
  600: '#059666',
  700: '#047852',
  800: '#065f43',
  900: '#064e38',
  950: '#022c1f',
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Semantic tokens (nguồn: globals.css)
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-on-primary)',
        },
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        foreground: 'var(--color-foreground)',
        'muted-foreground': 'var(--color-muted-foreground)',
        border: 'var(--color-border)',
        destructive: 'var(--color-destructive)',
        ring: 'var(--color-ring)',

        // Remap palette cũ -> tông Aurora Glass
        indigo: royal,
        violet: amethyst,
        purple: amethyst,
        fuchsia: amethyst,
        amber: gold,
        yellow: gold,
        slate: cloud,
        gray: cloud,
        zinc: cloud,
        neutral: cloud,
        stone: cloud,
        blue: azure,
        sky: azure,
        cyan: azure,
        teal: emerald,
        emerald,
        green: emerald,
        lime: emerald,
        red: rosewood,
        rose: rosewood,
        pink: rosewood,
        orange: apricot,

        // Tên riêng (code cũ có tham chiếu)
        gold,
        crimson: rosewood,
        copper: apricot,
        bronze: gold,
        charcoal: cloud,
        steel: azure,
        jade: emerald,
        royal,
        amethyst,
        cloud,
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        // Bóng kính: mềm, pha sắc chàm - dùng cho card nổi
        glass: '0 1px 2px rgba(28, 27, 75, 0.04), 0 10px 30px -12px rgba(28, 27, 75, 0.12)',
        'glass-lg': '0 2px 6px rgba(28, 27, 75, 0.06), 0 24px 60px -18px rgba(28, 27, 75, 0.22)',
        glow: '0 0 0 1px rgba(93, 104, 232, 0.18), 0 8px 32px -8px rgba(93, 104, 232, 0.35)',
      },
    },
  },
  plugins: [],
}

export default config
