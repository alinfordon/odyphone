import localFont from "next/font/local";
import { Providers } from "../components/Providers";
import "./globals.css";

const display = localFont({
  src: "./fonts/Outfit-Variable.ttf",
  weight: "100 900",
  display: "swap",
  variable: "--font-display",
});
const sans = localFont({
  src: "./fonts/SourceSans3-Variable.ttf",
  weight: "200 900",
  display: "swap",
  variable: "--font-sans",
});

export const metadata = {
  title: "ODY Phone AI",
  description: "Asistent telefonic pentru numerele autorizate explicit.",
};

const themeBoot = `(() => { try { var theme = localStorage.getItem("ody-phone-theme"); var root = document.documentElement; if (theme === "light") root.classList.remove("dark"); else root.classList.add("dark"); } catch (error) {} })();`;

export default function RootLayout({ children }) {
  return (
    <html lang="ro" className={`dark ${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
