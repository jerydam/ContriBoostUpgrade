import Link from "next/link";
import { Twitter, Github, MessageCircle } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  // Social media links (replace with your project's actual URLs)
  const socialLinks = [
    {
      name: "Twitter",
      href: "https://x.com/Contriboost",
      icon: <Twitter className="h-5 w-5" />,
      ariaLabel: "Follow Contriboost on Twitter",
    },
    {
      name: "Discord",
      href: "https://discord.gg/Contriboost",
      icon: <MessageCircle className="h-5 w-5" />,
      ariaLabel: "Join Contriboost on Discord",
    },
    {
      name: "GitHub",
      href: "https://github.com/Contriboost",
      icon: <Github className="h-5 w-5" />,
      ariaLabel: "View Contriboost on GitHub",
    },
  ];

  return (
    <footer className="w-full border-t bg-background">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 py-6 px-4 md:px-8">
        <p className="text-sm text-muted-foreground">
          © {currentYear} Contriboost. All rights reserved.
        </p>
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
          <nav aria-label="Footer navigation">
            <ul className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="About Contriboost"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/docs"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Contriboost Documentation"
                >
                  Docs
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Privacy Policy"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Terms of Service"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Social media links">
            <ul className="flex items-center gap-4">
              {socialLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={link.ariaLabel}
                  >
                    {link.icon}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}