import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Discover from './pages/Discover'
import DropDetail from './pages/DropDetail'
import Composer from './pages/Composer'
import Filter from './pages/Filter'
import VideoReview from './pages/VideoReview'
import Saved from './pages/Saved'
import Profile from './pages/Profile'
import Search from './pages/Search'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import FollowList from './pages/FollowList'
import InstallBanner from './components/InstallBanner'
import TallyIcon from './components/TallyIcon'
import LeaderboardRail from './components/LeaderboardRail'
import Camera from './pages/Camera'

export interface Route {
  name: 'home' | 'auth' | 'onboarding' | 'drop' | 'create' | 'edit' | 'filter' | 'video' | 'camera' | 'saved' | 'profile' | 'people' | 'search' | 'notifications' | 'settings' | 'followers' | 'following'
  param?: string
}

export function parseHash(): Route {
  const h = window.location.hash.replace(/^#/, '') || '/'
  const parts = h.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  const [a, b] = parts
  if (a === 'drop' && b) return { name: 'drop', param: b }
  if (a === 'edit' && b) return { name: 'edit', param: b }
  if (a === 'followers' && b) return { name: 'followers', param: b }
  if (a === 'following' && b) return { name: 'following', param: b }
  if (a === 'profile' && b) return { name: 'profile', param: decodeURIComponent(b) }
  if (a === 'profile') return { name: 'profile' }
  if (a === 'create') return { name: 'create' }
  if (a === 'filter') return { name: 'filter' }
  if (a === 'video') return { name: 'video' }
  if (a === 'camera') return { name: 'camera' }
  if (a === 'saved') return { name: 'saved' }
  if (a === 'search') return { name: 'search' }
  if (a === 'notifications') return { name: 'notifications' }
  if (a === 'settings') return { name: 'settings' }
  if (a === 'onboarding') return { name: 'onboarding' }
  if (a === 'auth') return { name: 'auth' }
  return { name: 'home' }
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash)
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

function MobileNav({ route }: { route: Route }) {
  const { profile } = useAuth()
  const active = (n: string) =>
    (route.name === 'home' && n === 'home') || route.name === (n as Route['name'])
  const tab = (n: { name: 'home' | 'saved' | 'search' | 'profile'; label: string; icon: string }) => (
    <button
      key={n.name}
      data-nav-tab={n.name}
      onClick={() => navigate(`/${n.name === 'home' ? '' : n.name}`)}
      className="flex flex-col items-center gap-0.5 py-2.5"
      aria-label={n.label}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xl ${
          active(n.name) ? 'bg-lime text-ink' : 'text-mute'
        }`}
      >
        {n.name === 'saved' ? (
          <TallyIcon saved={active(n.name)} className="h-5 w-5" />
        ) : n.name === 'profile' && profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          n.icon
        )}
      </span>
      <span className={`text-[10px] font-semibold ${active(n.name) ? 'text-lime' : 'text-mute'}`}>
        {n.label}
      </span>
    </button>
  )
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-ink/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tab({ name: 'home', label: 'Discover', icon: '⌂' })}
        {tab({ name: 'saved', label: 'Tallies', icon: '♡' })}
        <div className="flex items-start justify-center">
          <button
            onClick={() => navigate('/camera')}
            aria-label="Open camera"
            className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-lime text-ink shadow-[0_4px_20px_rgba(200,243,29,0.35)] transition active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-6 w-6">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.5 7l1.2-2h4.6L15.5 7M4 7h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"
              />
              <circle cx="12" cy="13.5" r="3.4" />
            </svg>
          </button>
        </div>
        {tab({ name: 'search', label: 'Search', icon: '⌕' })}
        {tab({ name: 'profile', label: 'Profile', icon: '◯' })}
      </div>
    </nav>
  )
}

function DesktopRail() {
  const route = useRoute()
  const { profile } = useAuth()
  const items = [
    { label: 'Discover', path: '/', match: 'home' },
    { label: 'Search', path: '/search', match: 'search' },
    { label: 'Tallies', path: '/saved', match: 'saved' },
    { label: 'Alerts', path: '/notifications', match: 'notifications' },
    { label: 'Profile', path: '/profile', match: 'profile' },
  ]
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-line p-6 md:flex">
      <button onClick={() => navigate('/')} className="mb-8 text-left text-3xl font-black tracking-tight">
        TALLY<span className="text-lime">.</span>
      </button>
      {items.map((i) => (
        <button
          key={i.label}
          data-nav-tab={i.match}
          onClick={() => navigate(i.path)}
          className={`rounded-full px-5 py-3 text-left text-lg font-bold transition ${
            route.name === i.match ? 'bg-ink-3 text-lime' : 'text-fog hover:bg-ink-2'
          }`}
        >
          {i.label}
        </button>
      ))}
      <button
        onClick={() => navigate('/create')}
        className="mt-4 rounded-full bg-lime px-5 py-3 text-lg font-black text-ink transition hover:bg-lime-dim"
      >
        Put someone on
      </button>
      <button
        onClick={() => navigate('/camera')}
        className="mt-2 flex items-center justify-center gap-2 rounded-full border border-line px-5 py-3 text-lg font-bold text-fog transition hover:border-lime hover:text-lime"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.5 7l1.2-2h4.6L15.5 7M4 7h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"
          />
          <circle cx="12" cy="13.5" r="3.4" />
        </svg>
        Camera
      </button>
      {profile && (
        <div className="mt-auto flex items-center gap-3">
          <Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} size={40} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">@{profile.username}</div>
            <div className="truncate text-xs text-mute">{profile.city}</div>
          </div>
        </div>
      )}
    </aside>
  )
}

export function Avatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    )
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className="flex items-center justify-center rounded-full bg-ink-3 font-black text-lime"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-label={name}
    >
      {initial}
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const { user, loading, needsOnboarding } = useAuth()

  useEffect(() => {
    if (loading) return
    // Route guards
    if (!user && ['create', 'edit', 'saved', 'onboarding', 'people'].includes(route.name)) {
      navigate('/auth')
    } else if (user && needsOnboarding && route.name !== 'onboarding') {
      navigate('/onboarding')
    } else if (user && !needsOnboarding && (route.name === 'auth' || route.name === 'onboarding')) {
      navigate('/')
    }
  }, [user, loading, needsOnboarding, route.name])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-4xl font-black tracking-tight">
          TALLY<span className="text-lime">.</span>
        </div>
      </div>
    )
  }

  const authed = !!user && !needsOnboarding

  const renderMain = () => {
    switch (route.name) {
      case 'auth':
        return <Landing mode="auth" />
      case 'onboarding':
        return <Onboarding />
      case 'drop':
        return <DropDetail id={route.param!} />
      case 'create':
        return <Composer />
      case 'filter':
        return <Filter />
      case 'video':
        return <VideoReview />
      case 'camera':
        return <Camera />
      case 'edit':
        return <Composer editId={route.param!} />
      case 'saved':
        return <Saved />
      case 'followers':
        return <FollowList profileId={route.param!} kind="followers" />
      case 'following':
        return <FollowList profileId={route.param!} kind="following" />
      case 'profile':
        return <Profile id={route.param} />
      case 'search':
        return <Search />
      case 'notifications':
        return <Notifications />
      case 'settings':
        return <Settings />
      case 'home':
      default:
        return user ? <Discover /> : <Landing mode="landing" />
    }
  }

  const showChrome = authed && route.name !== 'camera'

  return (
    <div className="min-h-screen bg-ink text-fog">
      <InstallBanner />
      <div className="mx-auto flex max-w-6xl">
        {showChrome && <DesktopRail />}
        <main
          className={`min-h-screen min-w-0 flex-1 ${showChrome ? 'md:border-r md:border-line' : ''} pb-24 md:pb-0`}
          style={{ maxWidth: showChrome ? 640 : undefined, margin: showChrome ? undefined : '0 auto' }}
        >
          {renderMain()}
        </main>
        {showChrome && (
          <aside className="sticky top-0 hidden h-screen w-80 shrink-0 overflow-y-auto p-6 lg:block">
            <LeaderboardRail />
          </aside>
        )}
      </div>
      {showChrome && <MobileNav route={route} />}
    </div>
  )
}
