import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Web3Provider } from "@/components/providers/web3-provider";
import MiniAppProvider from "@/components/providers/miniapp-provider";
import { ThemeScript } from "./theme-script";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const inter = Inter({ subsets: ["latin"] });

// Define the Mini App metadata
const miniAppMetadata = JSON.stringify({
  version: "1",
  imageUrl: "https://www.contriboost.xyz/og-image.png", 
  button: {
    title: "Launch Contriboost",
    action: {
      type: "launch_frame",
      name: "Contriboost",
      url: "https://www.contriboost.xyz",
      splashImageUrl: "https://www.contriboost.xyz/icon.png",
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
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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