import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="relative min-h-screen bg-dark-900 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-blue/20 rounded-full blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-neon-pink/10 rounded-full blur-[96px]" />
      </div>
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.03]" 
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} 
      />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
        {/* Hero Section */}
        <div className="text-center mb-20 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
            <span className="text-sm text-gray-300">Live tournaments now</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Compete in{' '}
            <span className="gradient-text">eFootball</span>
            <br />
            Tournaments
          </h1>
          
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Join the ultimate competitive eFootball platform. Create tournaments, 
            challenge players, and prove you're the best.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="btn-glow px-8 py-4 rounded-xl text-white font-semibold text-lg">
              Start Playing
            </Link>
            <Link to="/tournaments" className="px-8 py-4 rounded-xl border border-dark-600 text-white font-semibold text-lg hover:bg-dark-800 transition-all">
              Browse Tournaments
            </Link>
          </div>
        </div>
        
        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
          {[
            { value: '10K+', label: 'Active Players' },
            { value: '500+', label: 'Tournaments' },
            { value: '$50K+', label: 'Prizes Won' },
            { value: '99%', label: 'Satisfaction' },
          ].map((stat, i) => (
            <div key={i} className="glass-card-dark p-6 text-center slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="text-3xl font-bold gradient-text mb-2">{stat.value}</div>
              <div className="text-gray-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
        
        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {[
            {
              icon: '🏆',
              title: 'Tournament brackets',
              desc: 'Create and join knockout, league, or double elimination tournaments',
            },
            {
              icon: '⚽',
              title: 'Match results',
              desc: 'Submit scores with screenshots, auto-confirm or dispute',
            },
            {
              icon: '💬',
              title: 'Real-time chat',
              desc: 'Chat with players in your tournament, discuss strategies',
            },
          ].map((feature, i) => (
            <div 
              key={i} 
              className="glass-card-dark p-8 hover:border-primary/30 transition-all duration-300 scale-in"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
              <p className="text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>
        
        {/* CTA Section */}
        <div className="relative glass-card-dark p-12 text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-neon-blue/10" />
          <div className="relative">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to compete?
            </h2>
            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              Join thousands of players already competing in eFootball tournaments. 
              Create your free account and start today.
            </p>
            <Link to="/register" className="btn-glow px-8 py-4 rounded-xl text-white font-semibold text-lg inline-block">
              Create Free Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}