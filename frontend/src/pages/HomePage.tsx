import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Sparkles, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  Bot, 
  FileText, 
  TrendingUp, 
  ShieldCheck, 
  Zap, 
  Sun,
  Moon,
  Activity
} from 'lucide-react'
import { useAppSelector } from '@/hooks/redux'
import { useTheme } from '@/contexts/ThemeContext'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type HealthStatus = 'checking...' | 'OK' | 'unreachable'

export default function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated, role } = useAppSelector((state) => state.auth)
  const { theme, toggleTheme } = useTheme()
  const [status, setStatus] = useState<HealthStatus>('checking...')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeInteractiveTab, setActiveInteractiveTab] = useState<'match' | 'parser' | 'tracker'>('match')

  useEffect(() => {
    api
      .get('/health/')
      .then(() => setStatus('OK'))
      .catch(() => setStatus('unreachable'))
  }, [])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isAuthenticated && role?.toLowerCase() === 'student') {
      navigate(`/internships${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`)
    } else {
      navigate(`/register`)
    }
  }

  const destinationDashboard = role?.toLowerCase() === 'admin' ? '/admin/dashboard' : '/dashboard'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-neutral-900 dark:text-neutral-100 flex flex-col selection:bg-primary-500 selection:text-white transition-colors duration-300">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-primary-500/20 via-secondary-500/20 to-accent-500/10 blur-[130px] rounded-full" />
        <div className="absolute top-1/2 -left-40 w-[450px] h-[450px] bg-primary-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-10 -right-40 w-[500px] h-[500px] bg-secondary-500/15 blur-[140px] rounded-full" />
      </div>

      {/* Public Top Navbar */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-2xl border-b border-neutral-200/80 dark:border-neutral-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary-600 via-primary-500 to-secondary-500 text-white flex items-center justify-center font-black text-lg shadow-glow group-hover:rotate-6 transition-all duration-300">
              AI
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 bg-clip-text text-transparent">
                InternMatch
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 -mt-1">
                AI Career Engine
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
            <a href="#features" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              How It Works
            </a>
            <a href="#demo" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              AI Matching Demo
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-2xl text-neutral-600 hover:bg-neutral-100 hover:text-primary-600 transition-all duration-300 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-primary-400 border border-neutral-200/60 dark:border-neutral-800"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>

            {isAuthenticated ? (
              <Link to={destinationDashboard}>
                <Button className="rounded-2xl shadow-glow">
                  Go to Portal <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login">
                  <Button variant="ghost" className="rounded-2xl text-xs sm:text-sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button className="rounded-2xl text-xs sm:text-sm shadow-glow">
                    Get Started Free
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1">
        <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400 text-xs font-bold uppercase tracking-wider mb-6 animate-fade-in shadow-soft">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next-Gen Autonomous Internship Discovery</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.15] mb-6 animate-slide-up">
              Land Your Dream Tech Internship with{' '}
              <span className="bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 bg-clip-text text-transparent">
                Intelligent AI Matching
              </span>
            </h1>

            <p className="text-base sm:text-xl text-neutral-600 dark:text-neutral-400 leading-relaxed mb-8 animate-slide-up">
              Upload your resume and let our semantic matching engine pair your exact skills, projects, and career preferences with thousands of verified live internship opportunities.
            </p>

            {/* Interactive Search Bar */}
            <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto mb-8 animate-scale-in">
              <div className="relative flex items-center p-2 rounded-3xl bg-white/90 dark:bg-neutral-900/90 border-2 border-neutral-200/90 dark:border-neutral-700 shadow-medium focus-within:border-primary-500 focus-within:shadow-glow transition-all duration-300">
                <Search className="w-5 h-5 text-neutral-400 ml-4 mr-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search AI, Machine Learning, Frontend, Python internships..."
                  className="w-full bg-transparent border-none text-sm sm:text-base font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none px-2"
                />
                <Button type="submit" className="rounded-2xl px-6 py-3 shrink-0 shadow-glow">
                  Find Matches
                </Button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Automated Resume Parsing</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Verified Application Links</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Personalized Match Rationales</span>
            </div>
          </div>

          {/* Interactive Feature Simulation / Demo Card */}
          <div id="demo" className="max-w-5xl mx-auto pt-6">
            <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-2xl p-6 sm:p-8 shadow-card">
              {/* Tab Selector */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-neutral-200/70 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="ml-2 text-xs font-bold text-neutral-400 dark:text-neutral-500">
                    ai-internmatch-engine v2.4
                  </span>
                </div>

                <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-2xl">
                  <button
                    onClick={() => setActiveInteractiveTab('match')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeInteractiveTab === 'match'
                        ? 'bg-white dark:bg-neutral-900 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    AI Match Engine
                  </button>
                  <button
                    onClick={() => setActiveInteractiveTab('parser')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeInteractiveTab === 'parser'
                        ? 'bg-white dark:bg-neutral-900 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    CV Extractor
                  </button>
                  <button
                    onClick={() => setActiveInteractiveTab('tracker')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeInteractiveTab === 'tracker'
                        ? 'bg-white dark:bg-neutral-900 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    Application Pipeline
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {activeInteractiveTab === 'match' && (
                <div className="grid md:grid-cols-2 gap-8 items-center pt-6 animate-fade-in">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                        Top Matched Role
                      </span>
                      <Badge variant="default" className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-soft">
                        <Sparkles className="w-3.5 h-3.5 mr-1" /> 97% Match
                      </Badge>
                    </div>

                    <h3 className="text-2xl font-bold text-neutral-900 dark:text-white">
                      AI Software Engineer Intern
                    </h3>
                    <p className="text-sm font-semibold text-neutral-500">
                      Nexus Labs • San Francisco, CA (Remote Friendly)
                    </p>

                    <div className="p-4 rounded-2xl bg-primary-50/70 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-900/50">
                      <p className="text-xs font-bold uppercase text-primary-700 dark:text-primary-300 mb-1.5 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-primary-600" />
                        Why This Matches Your Profile
                      </p>
                      <p className="text-xs text-primary-900 dark:text-primary-200 leading-relaxed">
                        Matches your Python, PyTorch, and FastAPI projects from your uploaded resume. Aligns with your remote preference and summer graduation date.
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
                        Matched Skills
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {['Python', 'PyTorch', 'FastAPI', 'Docker', 'PostgreSQL', 'LangChain'].map((skill) => (
                          <span key={skill} className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                            ✓ {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/80 space-y-4">
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Multi-Dimensional Compatibility Score
                    </h4>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-neutral-600 dark:text-neutral-300">Technical Skills Match</span>
                          <span className="text-primary-600 dark:text-primary-400">98%</span>
                        </div>
                        <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full w-[98%]" />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-neutral-600 dark:text-neutral-300">Location & Work Mode</span>
                          <span className="text-emerald-600 dark:text-emerald-400">100%</span>
                        </div>
                        <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full w-[100%]" />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-neutral-600 dark:text-neutral-300">Experience Level Compatibility</span>
                          <span className="text-primary-600 dark:text-primary-400">94%</span>
                        </div>
                        <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full w-[94%]" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs text-neutral-500 font-medium">Deadline: July 30, 2026</span>
                      <Link to="/register">
                        <Button size="sm" className="rounded-xl text-xs font-bold shadow-soft">
                          Try Live Matcher
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {activeInteractiveTab === 'parser' && (
                <div className="grid md:grid-cols-2 gap-8 items-center pt-6 animate-fade-in">
                  <div className="p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/80 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900 dark:text-white">Alex_Resume_2026.pdf</p>
                        <p className="text-xs text-neutral-400 font-medium">Parsed in 0.42 seconds</p>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> 18 Technical Skills & 3 Projects Extracted
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                      Instant NLP Skill Extraction
                    </h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      Our semantic parser reads PDF, DOCX, and TXT resumes, instantly extracting your education, verified skills, and project experience without tedious manual data entry.
                    </p>
                    <Link to="/register">
                      <Button className="rounded-2xl text-xs font-bold shadow-soft">
                        Upload Your Resume <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {activeInteractiveTab === 'tracker' && (
                <div className="grid md:grid-cols-2 gap-8 items-center pt-6 animate-fade-in">
                  <div className="space-y-3">
                    {[
                      { role: 'Machine Learning Intern', company: 'DeepScale AI', status: 'Interview Scheduled', color: 'bg-primary-500 text-white' },
                      { role: 'Frontend Engineer Intern', company: 'Vercel Ecosystem', status: 'Application Submitted', color: 'bg-emerald-500 text-white' },
                      { role: 'Data Science Intern', company: 'Stripe Partners', status: 'Saved Opportunity', color: 'bg-neutral-500 text-white' },
                    ].map((item, i) => (
                      <div key={i} className="p-4 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-neutral-900 dark:text-white">{item.role}</p>
                          <p className="text-xs text-neutral-500">{item.company}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${item.color}`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                      Real-Time Application Tracking
                    </h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      Keep track of every internship you discover, save, and apply to. Never miss a recruiter update or application deadline again.
                    </p>
                    <Link to="/register">
                      <Button className="rounded-2xl text-xs font-bold shadow-soft">
                        Get Started <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Platform Metrics Bar */}
        <section className="py-12 bg-neutral-100/70 dark:bg-neutral-900/60 border-y border-neutral-200/60 dark:border-neutral-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div className="p-4">
                <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-primary-600 to-secondary-500 bg-clip-text text-transparent">
                  10,000+
                </p>
                <p className="text-xs sm:text-sm font-bold text-neutral-500 dark:text-neutral-400 mt-1">
                  Active Internships
                </p>
              </div>
              <div className="p-4">
                <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                  96.8%
                </p>
                <p className="text-xs sm:text-sm font-bold text-neutral-500 dark:text-neutral-400 mt-1">
                  Match Accuracy
                </p>
              </div>
              <div className="p-4">
                <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-accent-500 to-primary-600 bg-clip-text text-transparent">
                  450+
                </p>
                <p className="text-xs sm:text-sm font-bold text-neutral-500 dark:text-neutral-400 mt-1">
                  Partner Companies
                </p>
              </div>
              <div className="p-4">
                <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
                  24/7
                </p>
                <p className="text-xs sm:text-sm font-bold text-neutral-500 dark:text-neutral-400 mt-1">
                  Autonomous Web Scraper
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-2">
              Engineered for Speed & Quality
            </h2>
            <h3 className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
              Everything You Need to Succeed
            </h3>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800 shadow-soft hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-12 h-12 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-6">
                <Bot className="w-6 h-6" />
              </div>
              <h4 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                Semantic AI Matching
              </h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Beyond keywords: our neural embeddings understand your true technical strengths, coursework, and project context.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800 shadow-soft hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-12 h-12 rounded-2xl bg-secondary-500/10 text-secondary-600 dark:text-secondary-400 flex items-center justify-center mb-6">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h4 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                Live Opportunity Pipeline
              </h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Continuous scraping across top global job boards and direct career portals ensures you see roles the moment they open.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800 shadow-soft hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                Verified Direct Apply
              </h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Every opportunity link is verified for safety and redirects directly to official employer application forms.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20 bg-neutral-100/50 dark:bg-neutral-900/40 border-t border-neutral-200/60 dark:border-neutral-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-2">
                Simple 3-Step Journey
              </h2>
              <h3 className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
                How AI InternMatch Works
              </h3>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { step: '01', title: 'Create Profile & CV', desc: 'Upload your resume or enter your target skills, interests, and preferred work mode.' },
                { step: '02', title: 'AI Match & Score', desc: 'Our algorithm scores active internships against your profile with transparent explanations.' },
                { step: '03', title: 'Apply & Track', desc: 'Apply with one click directly to employers and track your applications end-to-end.' },
              ].map((item, idx) => (
                <div key={idx} className="relative p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-card">
                  <div className="text-4xl font-black bg-gradient-to-r from-primary-600 to-secondary-500 bg-clip-text text-transparent mb-4">
                    {item.step}
                  </div>
                  <h4 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
                    {item.title}
                  </h4>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="relative rounded-3xl bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-700 text-white p-10 sm:p-16 overflow-hidden shadow-glow">
            <div className="relative z-10 max-w-2xl">
              <h3 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">
                Ready to find your next tech internship?
              </h3>
              <p className="text-base sm:text-lg text-primary-100 mb-8 leading-relaxed">
                Join thousands of students leveraging AI matching to discover verified software, AI, data science, and design internships.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/register">
                  <Button size="lg" className="bg-white text-primary-900 hover:bg-neutral-100 rounded-2xl shadow-medium font-bold">
                    Create Free Account <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
                <Link to="/internships">
                  <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 rounded-2xl font-bold">
                    Browse All Roles
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-[#0c0c0e] border-t border-neutral-200/80 dark:border-neutral-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center font-bold text-sm">
              AI
            </div>
            <span className="font-bold text-sm text-neutral-900 dark:text-white">
              AI Internship Platform
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            <Link to="/internships" className="hover:text-primary-600 dark:hover:text-primary-400">
              Browse Internships
            </Link>
            <Link to="/login" className="hover:text-primary-600 dark:hover:text-primary-400">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-primary-600 dark:hover:text-primary-400">
              Register
            </Link>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <Activity className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-500 dark:text-neutral-400">Backend API:</span>
            <span className={status === 'OK' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 font-bold'}>
              {status}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
