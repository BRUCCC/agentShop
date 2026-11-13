const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../../data/products.json");

function loadCatalog() {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const products = raw.products.map((product) => {
    const stock = Number(product.stock);
    const reviews = Array.isArray(product.reviews) ? product.reviews : [];
    const ratingAvg = reviews.length
      ? Math.round((reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length) * 10) / 10
      : null;
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: Number(product.price),
      stock,
      catalogAvailable: stock > 0 ? stock : 0,
      description: product.description || "",
      specs: product.specs || {},
      reviews,
      recommendation_score: Number(product.recommendation_score) || 0,
      rating_avg: ratingAvg,
      review_count: reviews.length,
      margin_rate: product.margin_rate,
    };
  });
  return {
    store: raw.store,
    currency: raw.currency || "TWD",
    products,
  };
}

let cached;
function catalog() {
  if (!cached) cached = loadCatalog();
  return cached;
}

function availability(product, heldQty, soldQty) {
  const onHand = product.stock < 0 ? 0 : Math.max(0, product.stock - soldQty);
  const available = Math.max(0, onHand - heldQty);
  return {
    stock: onHand,
    available,
    sellable: product.stock > 0 && available > 0,
  };
}

function listItem(product, heldQty, soldQty) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: product.price,
    recommendation_score: product.recommendation_score,
    rating_avg: product.rating_avg,
    review_count: product.review_count,
    ...availability(product, heldQty, soldQty),
  };
}

function detailItem(product, heldQty, soldQty) {
  return {
    ...listItem(product, heldQty, soldQty),
    description: product.description,
    specs: product.specs,
    reviews: product.reviews,
  };
}

function findProduct(id) {
  return catalog().products.find((product) => product.id === id) || null;
}

function searchProducts({ q, brand, category, inStock, limit, offset, held, sold }) {
  const query = (q || "").trim().toLowerCase();
  let items = catalog().products.filter((product) => {
    if (query && !product.name.toLowerCase().includes(query)) return false;
    if (brand && product.brand !== brand) return false;
    if (category && product.category !== category) return false;
    return true;
  });
  items.sort((a, b) => b.recommendation_score - a.recommendation_score || a.id.localeCompare(b.id));
  if (inStock) {
    items = items.filter((product) => availability(product, held(product.id), sold(product.id)).sellable);
  }
  const total = items.length;
  const page = items.slice(offset, offset + limit).map((product) => listItem(product, held(product.id), sold(product.id)));
  return { total, limit, offset, items: page };
}

module.exports = {
  catalog,
  findProduct,
  searchProducts,
  listItem,
  detailItem,
  availability,
};
