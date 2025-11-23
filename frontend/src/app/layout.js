import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Web3Provider } from "@/components/providers/web3-provider";
// 1. Import the new provider
import MiniAppProvider from "@/components/providers/miniapp-provider"; 
import { ThemeScript } from "./theme-script";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const inter = Inter({ subsets: ["latin"] });

// 2. Add Farcaster Frame Metadata
const frameMetadata = JSON.stringify({
  version: "1",
  imageUrl: "https://www.Contriboost.xyz/og-image.png", // Replace with your actual URL
  button: {
    title: "Launch Contriboost",
    action: {
      type: "launch_frame",
      name: "Contriboost",
      url: "https://www.Contriboost.xyz", // Replace with your actual URL
      splashImageUrl: "https://www.Contriboost.xyz/icon.png",
      splashBackgroundColor: "#101b31",
    },
  },
});

export const metadata = {
  title: "Contriboost | Save Together, Achieve Together",
  description: "Create or join rotating savings pools with Contriboost.",
  icons: {
    icon: "/favicon.png",
  },
  other: {
    "fc:frame": frameMetadata,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {/* 3. Wrap everything in MiniAppProvider */}
          <MiniAppProvider>
            <Web3Provider>
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
                <ToastContainer
                  position="top-right"
                  autoClose={3000}
                  theme="light"
                  toastStyle={{
                    backgroundColor: "#101b31",
                    color: "#ffffff",
                    border: "1px solid #1e2a44",
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