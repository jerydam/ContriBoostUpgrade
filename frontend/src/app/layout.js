import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Web3Provider } from "@/components/providers/web3-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { showToast } from "@/utils/toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Contriboost | Save Together, Achieve Together",
  description: "Create or join rotating savings pools with Contriboost, or fund your goals with GoalFund.",
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "Contriboost",
    description: "A decentralized ecosystem for community savings and funding.",
    url: "https://Contriboost.vercel.app",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contriboost",
    description: "Save and fund goals together with Contriboost.",
    images: ["/twitter-image.png"],
  },
};

function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const theme = localStorage.getItem('theme') || (darkModeMediaQuery.matches ? 'dark' : 'light');
            document.documentElement.classList.add(theme);
            localStorage.setItem('theme', theme);
          })();
        `,
      }}
    />
  );
}

const toastConfig = {
  position: "top-right",
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  theme: "light",
  toastStyle: {
    backgroundColor: "#101b31",
    color: "#ffffff",
    border: "1px solid #6264c7",
  },
  progressStyle: {
    background: "#6264c7",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Web3Provider>
            <ErrorBoundary>
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
                <ToastContainer {...toastConfig} />
              </div>
            </ErrorBoundary>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}