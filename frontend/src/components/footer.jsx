import Link from "next/link"
import { cn } from "@/lib/utils"

export default function Footer({ className }) {
  const currentYear = new Date().getFullYear()

  return (
    <footer className={cn("w-full border-t bg-background", className)}>
      <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 py-6 px-4 md:px-8">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} Nestora. All rights reserved.</p>
        <nav>
          <ul className="flex items-center gap-4 sm:gap-6">
            <li>
              <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                About
              </Link>
            </li>
            <li>
              <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Docs
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
