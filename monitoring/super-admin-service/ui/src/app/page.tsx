'use client'

import { Activity, Database, Bell, Users, BarChart3, Shield, Settings } from 'lucide-react'
import { useState } from 'react'

interface Stat {
  label: string
  value: string
  change: string
  trend: 'up' | 'down' | 'stable'
  icon: typeof Activity
}

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const isLoading = false

  const metrics: Stat[] = [
    {
      label: 'Total Organizations',
      value: '12',
      change: '+12%',
      trend: 'up',
      icon: Users
    },
    {
      label: 'Active Projects',
      value: '45',
      change: '+8%',
      trend: 'up',
      icon: BarChart3
    },
    {
      label: 'DB Connections',
      value: '8',
      change: 'Healthy',
      trend: 'stable',
      icon: Database
    },
    {
      label: 'Active Alerts',
      value: '2',
      change: '-3%',
      trend: 'down',
      icon: Bell
    }
  ]

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'organizations', label: 'Organizations', icon: Users },
    { id: 'projects', label: 'Projects', icon: BarChart3 },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'system', label: 'System', icon: Settings },
  ]

  function cn(...classes: (string | boolean | undefined | null)[]) {
    return classes.filter(Boolean).join(' ')
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="navbar-start">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Simplify Projects</h1>
              <p className="text-xs text-base-content/70">Super Admin Console</p>
            </div>
          </div>
        </div>
        <div className="navbar-end">
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar">
              <div className="w-10 rounded-full bg-primary text-primary-content flex items-center justify-center">
                <Settings className="h-5 w-5" />
              </div>
            </div>
            <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
              <li><a>Profile</a></li>
              <li><a>Settings</a></li>
              <li><a>Logout</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="tabs tabs-bordered tabs-lg mb-8">
          {tabs.map((tab) => {
            const IconComponent = tab.icon
            return (
              <button
                key={tab.id}
                className={cn(
                  'tab gap-2',
                  activeTab === tab.id && 'tab-active'
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                <IconComponent className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {metrics.map((metric) => {
                const IconComponent = metric.icon
                return (
                  <div key={metric.label} className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <IconComponent className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm text-base-content/70">{metric.label}</p>
                            <p className="text-3xl font-bold">{isLoading ? '...' : metric.value}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={cn(
                          'text-sm font-medium',
                          metric.trend === 'up' && 'text-success',
                          metric.trend === 'down' && 'text-error',
                          metric.trend === 'stable' && 'text-warning'
                        )}>
                          {metric.change}
                        </span>
                        <span className="text-xs text-base-content/50">vs last month</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Quick Links */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <a href="http://localhost:3003" target="_blank" className="btn btn-outline btn-block">
                    <Activity className="h-4 w-4" />
                    Grafana
                  </a>
                  <button className="btn btn-outline btn-block">
                    <Database className="h-4 w-4" />
                    Analytics
                  </button>
                  <button className="btn btn-outline btn-block">
                    <Bell className="h-4 w-4" />
                    Alerts
                  </button>
                  <button className="btn btn-outline btn-block">
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other tabs content */}
        {activeTab !== 'overview' && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title capitalize">{activeTab} Management</h2>
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🚧</div>
                <p className="text-lg font-medium">Under Development</p>
                <p className="text-base-content/70">This section is coming soon...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}