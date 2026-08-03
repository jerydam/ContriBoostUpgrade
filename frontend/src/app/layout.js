import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import BottomNav from "@/components/bottom-nav";
import { Web3Provider } from "@/components/providers/web3-provider";
import {MiniAppProvider} from "@/components/providers/miniapp-provider";
import { ThemeScript } from "./theme-script";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Define the Mini App metadata
const miniAppMetadata = JSON.stringify({
  version: "1",
  imageUrl: "https://www.Nestora.xyz/icon.jpg",
  button: {
    title: "Launch Nestora",
    action: {
      type: "launch_frame",
      name: "Nestora",
      url: "https://www.Nestora.xyz",
      splashImageUrl: "https://www.Nestora.xyz/favicon.png",
      splashBackgroundColor: "#000000",
    },
  },
});

export const metadata = {
  title: "Nestora | Save Together, Achieve Together",
  description: "Create or join rotating savings pools with Nestora.",
  icons: {
    icon: "/favicon.png",
  },
  other: {
    // Add BOTH tags for maximum compatibility
    "fc:frame": miniAppMetadata,
    "fc:miniapp": miniAppMetadata,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <MiniAppProvider>
            <Web3Provider>
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1 pb-20 md:pb-0">{children}</main>
                <Footer className="hidden md:block" />
                <BottomNav />
                <ToastContainer
                  position="top-right"
                  autoClose={3000}
                  theme="dark"
                  toastStyle={{
                    backgroundColor: "#03221a",
                    color: "#f2f7f5",
                    border: "1px solid #12352a",
                  }}
                />
              </div>
            </Web3Provider>
          </MiniAppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}