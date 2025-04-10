import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import Header from "@/components/header"
import Footer from "@/components/footer"
import { Web3Provider } from "@/components/providers/web3-provider"
import { ThemeScript } from "./theme-script"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "Contriboost | Save Together, Achieve Together",
  description: "Create or join rotating savings pools with Contriboost, or fund your goals with GoalFund.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="system">
          <Web3Provider>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  )
}
