import type { Config } from 'tailwindcss'

// ============================================================
// LUXURY REMAP — "Noir & Gold"
// Toàn bộ code cũ dùng indigo/violet/slate/amber... được remap
// về tông sang trọng: than chì ấm + vàng đồng + xám đá ấm.
// Nhờ đó KHÔNG cần sửa từng file, đổi 1 chỗ là cả app đổi theo.
// ============================================================

/** Than chì ấm — thay cho indigo (màu brand cũ) */
const charcoal = {
  50: '#f7f6f4',
  100: '#efedea',
  200: '#dfdbd4',
  300: '#c6c0b6',
  400: '#a89f92',
  500: '#78716c',
  600: '#57534e',
  700: '#44403c',
  800: '#292524',
  900: '#1c1917',
  950: '#0c0a09',
}

/** Vàng đồng quý — thay cho amber/yellow */
const gold = {
  50: '#fdf9ee',
  100: '#f8efd7',
  200: '#f1dfae',
  300: '#e5c369',
  400: '#d4af37',
  500: '#c9a227',
  600: '#a16207',
  700: '#854d0e',
  800: '#6b3f10',
  900: '#573412',
  950: '#3d2308',
}

/** Đồng cổ — thay cho violet/purple/fuchsia (màu phụ cũ) */
const bronze = {
  50: '#faf6ef',
  100: '#f2ead9',
  200: '#e4d3b1',
  300: '#d3b783',
  400: '#c19c5c',
  500: '#a97f3e',
  600: '#8d6532',
  700: '#714e2b',
  800: '#5d4128',
  900: '#4e3724',
  950: '#2c1d11',
}

/** Xám đá ấm — thay cho slate/gray lạnh */
const stone = {
  50: '#faf9f7',
  100: '#f3f1ed',
  200: '#e7e2da',
  300: '#d5cec3',
  400: '#aaa093',
  500: '#78716c',
  600: '#57534e',
  700: '#44403c',
  800: '#292524',
  900: '#1c1917',
  950: '#0c0a09',
}

/** Đỏ thẫm quý phái — thay cho red/rose tươi chói */
const crimson = {
  50: '#fbf3f1',
  100: '#f6e3df',
  200: '#ecc8c1',
  300: '#dda498',
  400: '#c97a6b',
  500: '#b25847',
  600: '#9a3f30',
  700: '#7f3428',
  800: '#692c24',
  900: '#572621',
  950: '#2f120e',
}

/** Đồng đỏ ấm — thay cho orange chói */
const copper = {
  50: '#fcf6ef',
  100: '#f7e8d8',
  200: '#edd0af',
  300: '#e0b17e',
  400: '#d18f50',
  500: '#c07430',
  600: '#a85c22',
  700: '#8b491e',
  800: '#713c1e',
  900: '#5d321c',
  950: '#33180c',
}

/** Xanh thép trầm — thay cho blue/sky chói */
const steel = {
  50: '#f4f6f7',
  100: '#e6eaee',
  200: '#cfd8de',
  300: '#a9bac6',
  400: '#7d95a7',
  500: '#5f7a8e',
  600: '#4c6275',
  700: '#3f505f',
  800: '#374551',
  900: '#303c45',
  950: '#20282e',
}

/** Ngọc bích trầm — thay cho emerald/green tươi */
const jade = {
  50: '#f2f7f4',
  100: '#e0ede5',
  200: '#c2dbcc',
  300: '#9ac2ab',
  400: '#6da487',
  500: '#4c8a6b',
  600: '#3a7157',
  700: '#305a47',
  800: '#29483a',
  900: '#223c31',
  950: '#11211b',
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
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

        // Remap palette cũ -> tông sang trọng
        indigo: charcoal,
        violet: bronze,
        purple: bronze,
        fuchsia: gold,
        amber: gold,
        yellow: gold,
        slate: stone,
        gray: stone,
        zinc: stone,
        neutral: stone,
        stone,
        blue: steel,
        sky: steel,
        cyan: steel,
        teal: jade,
        emerald: jade,
        green: jade,
        lime: jade,
        red: crimson,
        rose: crimson,
        pink: crimson,
        orange: copper,
        gold,
        crimson,
        copper,
        bronze,
        charcoal,
        steel,
        jade,
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
