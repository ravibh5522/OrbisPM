import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="bg-base-100 border-t border-base-200 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="Simplify Projects" className="h-8 w-auto" />
              <span className="text-lg font-bold">Simplify Projects</span>
            </Link>
            <p className="text-sm text-base-content/50 leading-relaxed">
              AI-native project management platform for modern engineering teams. Enterprise-ready with real-time collaboration.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-base-content/50">
              <li>
                <Link href="/features" className="hover:text-primary transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-primary transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-primary transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-4">Alternatives</h4>
            <ul className="space-y-2 text-sm text-base-content/50">
              <li>
                <Link href="/alternatives/jira" className="hover:text-primary transition-colors">
                  Simplify Projects vs Jira
                </Link>
              </li>
              <li>
                <Link href="/alternatives/asana" className="hover:text-primary transition-colors">
                  Simplify Projects vs Asana
                </Link>
              </li>
              <li>
                <Link href="/alternatives/trello" className="hover:text-primary transition-colors">
                  Simplify Projects vs Trello
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-base-content/50">
              <li>
                <Link href="/about" className="hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-primary transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-primary transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-base-content/50">
              <li>
                <Link href="/privacy" className="hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-base-200 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-base-content/40">
            &copy; {new Date().getFullYear()} SimplifyAI. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/orbispm"
              className="text-base-content/40 hover:text-primary transition-colors text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://twitter.com/orbispm"
              className="text-base-content/40 hover:text-primary transition-colors text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Twitter
            </a>
            <a
              href="https://discord.gg/orbispm"
              className="text-base-content/40 hover:text-primary transition-colors text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>
            <a
              href="https://linkedin.com/company/orbispm"
              className="text-base-content/40 hover:text-primary transition-colors text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
