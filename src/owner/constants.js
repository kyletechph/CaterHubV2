export const TABS = [
  ['', 'Overview'],
  ['inq', 'Inquiries'],
  ['av', 'Availability'],
  ['pk', 'Packages'],
  ['pf', 'Business profile'],
  ['nt', 'Notifications'],
];
export const STATUSES = ['Pending', 'Replied', 'Available', 'Unavailable', 'Confirmed Outside System', 'Cancelled'];
// the statuses an owner can move an inquiry to
export const OWNER_STATUSES = STATUSES.slice(1);

// Suggested dishes per category. Owners click a suggestion to add it, or type their own.
export const MENU_LIBRARY = {
  Beef: ['Beef Caldereta', 'Beef Teriyaki', 'Beefsteak', 'Beef Stew', 'Beef in White', 'White Cream Sauce', 'Beef Salpicao', 'Beef in Broccoli', 'Beef Mechado', 'Beef Mongolian'],
  Pork: ['Pork Tonktasu', 'Pork Rib Calderreta', 'Pork Mechado', 'Pork Steak in Chinese Style', 'Spare Ribs Fried', 'Menudo', 'Pork Chinese Sweet n Sour', 'Pork Ribs in Honey Dip'],
  Chicken: ['Hawaiian Roasted', 'Chicken Strips', 'Buffalo Wings', 'Battered Chicken', 'Chicken Pamapa', 'Chinese Sweet n Sour', 'Chicken Teriyaki', 'Afritada', 'Salpicao', 'Aviana'],
  Seafood: ['Fish Fillet', 'Sweet n Sour Fish', 'Fish Steak', 'Sweet n Spicy Shrimp', 'Chili Crab', 'Kalandrakas'],
  Vegetable: ['Chopsuey', 'Four Season Vegetables', 'Ampalaya con Carne', "Buddha's Delight", 'Vegetable Kare Kare'],
  'Pasta / Pancit': ['Spaghetti', 'Carbonara', 'Pancit Bam-E', 'Pancit Bihon', 'Pancit Canton', 'Sotanghon', 'Pancit Malabon'],
  Dessert: ['Mango Crepe', 'Fruit Salad', 'Leche Flan', 'Panna Cotta', 'Coffee Jelly', 'Buko Pandan', 'Black Sambo', 'Maja Blanca', 'Peach Mango Tapioca'],
  Kakanin: ['Kakanin Combo', 'Suman Tikoy', 'Suman Latik', 'Banana Cinnamon', 'Biko', 'Palawan', 'Puto', 'Kutchinta'],
  Appetizer: ['Linukot', 'Atsara', 'Nachos', 'Lumpiang Shanghai', 'Cheese Sticks', 'Fresh Fruits'],
};

export const PKG_TYPES = [
  ['catering', 'Catering package', 'Full service: menu plus setup, staff, and tables and chairs as needed.'],
  ['food', 'Food package', 'Food only: a menu or combo with no service setup.'],
];
