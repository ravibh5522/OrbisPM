"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, ArrowRight, Menu, X, ChevronDown } from "lucide-react";

const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  {
    label: "Alternatives",
    href: "/alternatives/jira",
    children: [
      { label: "OrbisPM vs Jira", href: "/alternatives/jira" },
      { label: "OrbisPM vs Asana", href: "/alternatives/asana" },
      { label: "OrbisPM vs Trello", href: "/alternatives/trello" },
    ],
  },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-base-100/95 backdrop-blur-md shadow-sm border-b border-base-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary-content" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              OrbisPM
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) =>
              link.children ? (
                <div key={link.href} className="relative group">
                  <button className="px-3 py-2 text-sm font-medium text-base-content/70 hover:text-primary transition-colors rounded-lg hover:bg-base-200 flex items-center gap-1">
                    {link.label}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute top-full left-0 pt-1 hidden group-hover:block">
                    <div className="bg-base-100 border border-base-200 rounded-xl shadow-xl p-2 min-w-[200px]">
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="block px-3 py-2 text-sm text-base-content/70 hover:text-primary hover:bg-base-200 rounded-lg transition-colors"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 text-sm font-medium text-base-content/70 hover:text-primary transition-colors rounded-lg hover:bg-base-200"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <Link href="/login" className="btn btn-ghost btn-sm">
              Sign In
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm gap-1">
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <button
            className="lg:hidden btn btn-ghost btn-sm btn-square"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden pb-4 border-t border-base-200">
            <nav className="flex flex-col gap-1 pt-3">
              {navLinks.map((link) => (
                <div key={link.href}>
                  <Link
                    href={link.href}
                    className="px-3 py-2 text-sm font-medium text-base-content/70 hover:text-primary rounded-lg hover:bg-base-200 block"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                  {link.children && (
                    <div className="pl-6">
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="px-3 py-1.5 text-sm text-base-content/50 hover:text-primary rounded-lg hover:bg-base-200 block"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-3 px-3">
                <Link href="/login" className="btn btn-ghost btn-sm flex-1">
                  Sign In
                </Link>
                <Link href="/signup" className="btn btn-primary btn-sm flex-1">
                  Get Started
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
