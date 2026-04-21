import React, { useState, useEffect } from 'react';
import { Store, Package, ShoppingCart, Heart, Search, Filter, RefreshCw, Plus, ChevronRight, Tag, DollarSign, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

interface Product {
  id: string;
  name: string;
  type: string;
  price: number;
  unit: string;
  available: number;
  seller: string;
  rating: number;
  image?: string;
}

export function Marketplace() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCart, setShowCart] = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/marketplace/products').catch(() => ({
        data: { success: true, data: getDefaultProducts() }
      }));
      setProducts(res.data?.data || getDefaultProducts());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchProducts} /></div>;

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.type === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const toggleFavorite = (productId: string) => {
    setFavorites(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="text-ionex-text-mute">Energy products, RECs, and services</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light"
          >
            <ShoppingCart className="w-4 h-4" />
            Cart ({cart.length})
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
            <Plus className="w-4 h-4" /> List Product
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ionex-text-mute" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-ionex-border-200 rounded-lg focus:border-ionex-brand"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border border-ionex-border-200 rounded-lg"
        >
          <option value="all">All Categories</option>
          <option value="solar">Solar</option>
          <option value="wind">Wind</option>
          <option value="recs">RECs</option>
          <option value="storage">Storage</option>
        </select>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={<Store className="w-8 h-8" />} title="No products found" description="Try adjusting your search or filters" />
          </div>
        ) : (
          filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              isFavorite={favorites.includes(product.id)}
              onToggleFavorite={() => toggleFavorite(product.id)}
              onAddToCart={() => addToCart(product)}
            />
          ))
        )}
      </div>

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50">
          <div className="bg-white h-full w-full max-w-md shadow-xl">
            <div className="p-4 border-b border-ionex-border-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Shopping Cart</h2>
              <button onClick={() => setShowCart(false)} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <EmptyState icon={<ShoppingCart className="w-8 h-8" />} title="Cart is empty" description="Add products to your cart" />
              ) : (
                <div className="space-y-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-ionex-text-mute">{formatZAR(item.price)} / {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCart(prev => prev.map(c => c.id === item.id ? { ...c, quantity: Math.max(0, c.quantity - 1) } : c).filter(c => c.quantity > 0))}
                          className="w-8 h-8 rounded border hover:bg-gray-100"
                        >-</button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <button
                          onClick={() => setCart(prev => prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))}
                          className="w-8 h-8 rounded border hover:bg-gray-100"
                        >+</button>
                      </div>
                      <span className="font-semibold">{formatZAR(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t border-ionex-border-100">
                <div className="flex justify-between mb-4">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold">{formatZAR(cartTotal)}</span>
                </div>
                <button className="w-full py-3 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">
                  Proceed to Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, isFavorite, onToggleFavorite, onAddToCart }: {
  product: Product;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onAddToCart: () => void;
}) {
  const typeIcons: Record<string, React.ReactNode> = {
    solar: <Zap className="w-4 h-4" />,
    wind: <Zap className="w-4 h-4" />,
    recs: <Tag className="w-4 h-4" />,
    storage: <Package className="w-4 h-4" />,
  };

  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 overflow-hidden hover:shadow-lg transition-shadow">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <span className="flex items-center gap-1 px-2 py-1 bg-ionex-brand/10 text-ionex-brand text-xs rounded-full">
            {typeIcons[product.type] || <Tag className="w-4 h-4" />}
            {product.type.toUpperCase()}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-1 rounded ${isFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
        
        <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
        <p className="text-sm text-ionex-text-mute mb-3">by {product.seller}</p>
        
        <div className="flex items-center gap-1 mb-3">
          {[...Array(5)].map((_, i) => (
            <span key={i} className={`text-sm ${i < product.rating ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
          ))}
          <span className="text-xs text-ionex-text-mute ml-1">({product.rating})</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xl font-bold text-gray-900">{formatZAR(product.price)}</span>
            <span className="text-sm text-ionex-text-mute">/{product.unit}</span>
          </div>
          <span className="text-sm text-green-600">{product.available.toLocaleString()} available</span>
        </div>

        <button
          onClick={onAddToCart}
          className="w-full py-2 bg-ionex-accent text-white rounded-lg hover:bg-ionex-accent-deep transition-colors"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}

function getDefaultProducts(): Product[] {
  return [
    { id: '1', name: 'Solar RECs - Q3 2024', type: 'recs', price: 125, unit: 'MWh', available: 500, seller: 'SolarCorp SA', rating: 4.5 },
    { id: '2', name: 'Wind Energy Credits', type: 'recs', price: 140, unit: 'MWh', available: 350, seller: 'WindPower Ltd', rating: 4.8 },
    { id: '3', name: 'Battery Storage Credits', type: 'storage', price: 200, unit: 'MWh', available: 100, seller: 'StorageTech', rating: 4.2 },
    { id: '4', name: 'Solar PPA - 5MW', type: 'solar', price: 850000, unit: 'month', available: 1, seller: 'SunEnergy', rating: 4.6 },
    { id: '5', name: 'Wind Farm Energy', type: 'wind', price: 950, unit: 'MWh', available: 200, seller: 'WindCo', rating: 4.4 },
    { id: '6', name: 'Green Energy Bundle', type: 'recs', price: 110, unit: 'MWh', available: 1000, seller: 'EcoPower', rating: 4.7 },
    { id: '7', name: 'Solar Panel Installation', type: 'solar', price: 45000, unit: 'kW', available: 5000, seller: 'SolarPro', rating: 4.3 },
    { id: '8', name: 'Carbon Offset Credits', type: 'recs', price: 85, unit: 'tCO₂e', available: 10000, seller: 'CarbonTrust', rating: 4.9 },
  ];
}