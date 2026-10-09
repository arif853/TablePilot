<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\RestaurantTable;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Two ready-to-use demo restaurants, each with staff logins, an active annual
 * subscription, tables with QR codes, a full menu and a couple of vouchers.
 * All demo logins use the password 12345678. Must run AFTER SubscriptionPlanSeeder.
 */
class DemoRestaurantSeeder extends Seeder
{
    private const PASSWORD = '12345678';

    public function run(): void
    {
        foreach ($this->restaurants() as $restaurant) {
            $this->seedRestaurant($restaurant);
        }
    }

    private function seedRestaurant(array $data): void
    {
        $plan = SubscriptionPlan::where('slug', $data['plan'])->firstOrFail();

        $tenant = Tenant::create([
            ...$data['tenant'],
            'currency' => 'BDT',
            'max_users' => $plan->max_users,
            'is_active' => true,
        ]);

        foreach ($data['users'] as $user) {
            User::create([
                ...$user,
                'tenant_id' => $tenant->id,
                'password' => self::PASSWORD,
                'status' => 'active',
            ]);
        }

        Subscription::create([
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'plan_type' => $plan->subscriptionType(),
            'is_trial' => false,
            'amount' => $plan->annual_price,
            'payment_method' => 'manual',
            'starts_at' => today(),
            'expires_at' => today()->addYear(),
            'status' => 'active',
            'initiated_by' => 'super_admin',
            'notes' => 'Demo subscription (annual)',
        ]);

        $tableCount = 0;
        foreach ($data['tables'] as $capacity => $count) {
            for ($i = 0; $i < $count; $i++) {
                $number = 'T' . str_pad((string) ++$tableCount, 2, '0', STR_PAD_LEFT);

                RestaurantTable::create([
                    'tenant_id' => $tenant->id,
                    'table_number' => $number,
                    'qr_code' => 'TBL-' . $tenant->id . '-' . $number . '-' . Str::upper(Str::random(6)),
                    'capacity' => $capacity,
                    'status' => 'available',
                ]);
            }
        }

        $categorySort = 0;
        foreach ($data['menu'] as $categoryName => $category) {
            $categoryModel = Category::create([
                'tenant_id' => $tenant->id,
                'name' => $categoryName,
                'description' => $category['description'],
                'sort_order' => $categorySort++,
                'is_active' => true,
            ]);

            foreach ($category['items'] as $itemSort => [$name, $price, $description]) {
                MenuItem::create([
                    'tenant_id' => $tenant->id,
                    'category_id' => $categoryModel->id,
                    'name' => $name,
                    'description' => $description,
                    'price' => $price,
                    'is_active' => true,
                    'sort_order' => $itemSort,
                ]);
            }
        }

        foreach ($data['vouchers'] as $voucher) {
            Voucher::create([
                ...$voucher,
                'tenant_id' => $tenant->id,
                'is_active' => true,
                'used_count' => 0,
            ]);
        }
    }

    private function restaurants(): array
    {
        return [
            [
                'plan' => 'enterprise',
                'tenant' => [
                    'name' => 'Spice Garden',
                    'slug' => 'spice-garden',
                    'email' => 'hello@spicegarden.test',
                    'phone' => '+8801711000101',
                    'address' => 'House 12, Road 11, Banani, Dhaka 1213',
                    'description' => 'Authentic Bangladeshi and Mughlai cuisine — kacchi biryani, slow-cooked curries and charcoal kebabs.',
                    'payment_mode' => 'seller',
                    'commission_rate' => 0,
                    'tax_rate' => 5.00,
                    'vat_registered' => true,
                    'vat_number' => '000000000-0101',
                    'default_vat_rate' => 5.00,
                    'default_sd_rate' => 0,
                    'vat_inclusive' => false,
                ],
                'users' => [
                    ['name' => 'Rahim Uddin', 'email' => 'owner@spicegarden.test', 'role' => User::ROLE_RESTAURANT_ADMIN, 'phone' => '+8801711000102'],
                    ['name' => 'Sohel Rana', 'email' => 'waiter@spicegarden.test', 'role' => User::ROLE_STAFF, 'phone' => '+8801711000103'],
                    ['name' => 'Jamal Hossain', 'email' => 'kitchen@spicegarden.test', 'role' => User::ROLE_KITCHEN, 'phone' => '+8801711000104'],
                ],
                // capacity => number of tables
                'tables' => [2 => 4, 4 => 6, 6 => 3, 10 => 1],
                'menu' => [
                    'Starters' => [
                        'description' => 'Light bites to begin the meal',
                        'items' => [
                            ['Vegetable Samosa (4 pcs)', 120, 'Crispy pastry filled with spiced potato and peas'],
                            ['Chicken Pakora', 220, 'Bite-size chicken fritters in spiced gram-flour batter'],
                            ['Beef Shami Kebab (2 pcs)', 240, 'Minced beef and lentil patties, pan-fried'],
                            ['Fuchka (8 pcs)', 150, 'Crisp puffs with tamarind water and spiced chickpeas'],
                        ],
                    ],
                    'Biryani & Rice' => [
                        'description' => 'Fragrant rice dishes cooked dum-style',
                        'items' => [
                            ['Mutton Kacchi Biryani', 480, 'Old Dhaka style kacchi with tender mutton, potato and borhani'],
                            ['Chicken Biryani', 350, 'Basmati rice layered with spiced chicken'],
                            ['Beef Tehari', 280, 'Mustard-oil tehari with diced beef and green chilli'],
                            ['Morog Polao', 320, 'Chinigura rice with braised chicken'],
                            ['Plain Polao', 120, 'Aromatic chinigura rice'],
                        ],
                    ],
                    'Curries' => [
                        'description' => 'Slow-cooked gravies, best with polao or naan',
                        'items' => [
                            ['Beef Kala Bhuna', 420, 'Chittagong-style dark, dry-roasted beef'],
                            ['Chicken Rezala', 380, 'Chicken in a mild yoghurt and cashew gravy'],
                            ['Mutton Rogan Josh', 520, 'Kashmiri-spiced mutton curry'],
                            ['Rui Fish Curry', 340, 'River fish in a light tomato and cumin gravy'],
                            ['Dal Makhani', 200, 'Black lentils simmered with butter and cream'],
                        ],
                    ],
                    'Kebab & Grill' => [
                        'description' => 'Charcoal-grilled to order',
                        'items' => [
                            ['Chicken Tikka (6 pcs)', 360, 'Yoghurt-marinated chicken from the tandoor'],
                            ['Beef Boti Kebab', 400, 'Skewered beef cubes with house masala'],
                            ['Reshmi Kebab', 380, 'Creamy, mildly spiced chicken skewers'],
                            ['Grilled Chicken (Half)', 450, 'Whole-spice marinated half chicken with salad'],
                        ],
                    ],
                    'Breads' => [
                        'description' => 'Fresh from the tandoor',
                        'items' => [
                            ['Butter Naan', 60, 'Soft tandoor naan brushed with butter'],
                            ['Garlic Naan', 80, 'Naan topped with garlic and coriander'],
                            ['Paratha', 40, 'Layered flaky flatbread'],
                        ],
                    ],
                    'Desserts' => [
                        'description' => 'Something sweet to finish',
                        'items' => [
                            ['Firni', 120, 'Chilled ground-rice pudding with cardamom'],
                            ['Shahi Tukra', 180, 'Fried bread in saffron rabri with nuts'],
                            ['Mishti Doi', 100, 'Bogura-style sweet yoghurt'],
                            ['Rasmalai (2 pcs)', 160, 'Cottage-cheese dumplings in thickened milk'],
                        ],
                    ],
                    'Drinks' => [
                        'description' => 'Cool and refreshing',
                        'items' => [
                            ['Borhani', 80, 'Spiced yoghurt drink — the classic biryani partner'],
                            ['Mango Lassi', 150, 'Thick yoghurt shake with ripe mango'],
                            ['Fresh Lime Soda', 90, 'Sweet, salted or mixed'],
                            ['Masala Tea', 50, 'Milk tea brewed with ginger and cardamom'],
                            ['Mineral Water (500 ml)', 30, 'Chilled bottled water'],
                        ],
                    ],
                ],
                'vouchers' => [
                    ['code' => 'SPICE10', 'type' => 'percentage', 'discount_value' => 10, 'min_purchase' => 1000, 'max_uses' => 200, 'expiry_date' => today()->addMonths(6)],
                    ['code' => 'FAMILY200', 'type' => 'fixed', 'discount_value' => 200, 'min_purchase' => 2500, 'max_uses' => 100, 'expiry_date' => today()->addMonths(3)],
                ],
            ],
            [
                'plan' => 'professional',
                'tenant' => [
                    'name' => 'Urban Bites Café',
                    'slug' => 'urban-bites-cafe',
                    'email' => 'hello@urbanbites.test',
                    'phone' => '+8801811000201',
                    'address' => 'Road 27 (Old), Dhanmondi, Dhaka 1209',
                    'description' => 'A cosy all-day café serving specialty coffee, wood-fired pizza, burgers and pasta.',
                    'primary_color' => '#0F766E',
                    'secondary_color' => '#115E59',
                    'accent_color' => '#F59E0B',
                    'payment_mode' => 'seller',
                    'commission_rate' => 0,
                    'tax_rate' => 5.00,
                    'vat_registered' => false,
                    'default_vat_rate' => 5.00,
                    'default_sd_rate' => 0,
                    'vat_inclusive' => true,
                ],
                'users' => [
                    ['name' => 'Nusrat Jahan', 'email' => 'owner@urbanbites.test', 'role' => User::ROLE_RESTAURANT_ADMIN, 'phone' => '+8801811000202'],
                    ['name' => 'Tanvir Ahmed', 'email' => 'waiter@urbanbites.test', 'role' => User::ROLE_STAFF, 'phone' => '+8801811000203'],
                    ['name' => 'Arif Chowdhury', 'email' => 'kitchen@urbanbites.test', 'role' => User::ROLE_KITCHEN, 'phone' => '+8801811000204'],
                ],
                'tables' => [2 => 4, 4 => 4],
                'menu' => [
                    'Coffee' => [
                        'description' => 'Espresso-based drinks from single-origin beans',
                        'items' => [
                            ['Espresso', 160, 'A rich double shot'],
                            ['Americano', 190, 'Espresso topped with hot water'],
                            ['Cappuccino', 240, 'Espresso with steamed milk and thick foam'],
                            ['Caffè Latte', 260, 'Espresso with silky steamed milk'],
                            ['Iced Caramel Latte', 290, 'Chilled latte with house caramel'],
                        ],
                    ],
                    'Tea & Shakes' => [
                        'description' => 'Non-coffee favourites',
                        'items' => [
                            ['Iced Lemon Tea', 160, 'Black tea shaken with lemon and mint'],
                            ['Chocolate Shake', 280, 'Thick shake with Belgian chocolate'],
                            ['Oreo Shake', 300, 'Vanilla ice cream blended with Oreo cookies'],
                            ['Fresh Orange Juice', 220, 'Pressed to order'],
                        ],
                    ],
                    'Breakfast' => [
                        'description' => 'Served all day',
                        'items' => [
                            ['Classic English Breakfast', 450, 'Eggs, sausage, baked beans, toast and hash brown'],
                            ['Pancake Stack', 320, 'Three fluffy pancakes with maple syrup and butter'],
                            ['Cheese Omelette', 220, 'Three-egg omelette with cheddar and toast'],
                        ],
                    ],
                    'Burgers & Sandwiches' => [
                        'description' => 'Served with fries',
                        'items' => [
                            ['Classic Beef Burger', 380, 'Beef patty, cheddar, lettuce, tomato and house sauce'],
                            ['Crispy Chicken Burger', 340, 'Fried chicken thigh with coleslaw and spicy mayo'],
                            ['Club Sandwich', 360, 'Chicken, egg, cheese and veggies on toasted bread'],
                            ['Grilled Veggie Panini', 280, 'Roasted vegetables and mozzarella'],
                        ],
                    ],
                    'Pizza' => [
                        'description' => '10-inch wood-fired pizzas',
                        'items' => [
                            ['Margherita', 550, 'Tomato, fresh mozzarella and basil'],
                            ['Chicken BBQ', 690, 'BBQ chicken, onion and mozzarella'],
                            ['Beef Pepperoni', 750, 'Beef pepperoni and mozzarella'],
                            ['Four Cheese', 720, 'Mozzarella, cheddar, parmesan and blue cheese'],
                        ],
                    ],
                    'Pasta' => [
                        'description' => 'Made fresh to order',
                        'items' => [
                            ['Chicken Alfredo', 450, 'Fettuccine in creamy parmesan sauce'],
                            ['Spaghetti Bolognese', 420, 'Slow-cooked beef ragù'],
                            ['Penne Arrabbiata', 360, 'Spicy tomato and garlic sauce'],
                        ],
                    ],
                    'Desserts' => [
                        'description' => 'Baked in-house daily',
                        'items' => [
                            ['New York Cheesecake', 320, 'Baked cheesecake with berry compote'],
                            ['Chocolate Brownie with Ice Cream', 280, 'Warm fudge brownie and vanilla scoop'],
                            ['Tiramisu', 350, 'Coffee-soaked sponge with mascarpone'],
                        ],
                    ],
                ],
                'vouchers' => [
                    ['code' => 'COFFEE15', 'type' => 'percentage', 'discount_value' => 15, 'min_purchase' => 500, 'max_uses' => 300, 'expiry_date' => today()->addMonths(3)],
                    ['code' => 'WELCOME100', 'type' => 'fixed', 'discount_value' => 100, 'min_purchase' => 800, 'max_uses' => 100, 'expiry_date' => today()->addMonths(2)],
                ],
            ],
        ];
    }
}
