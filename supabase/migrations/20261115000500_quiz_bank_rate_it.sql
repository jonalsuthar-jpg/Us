-- Rate it together: a thing each of us rates 1–10. Ids r001, r002, …: add at
-- the END only.

insert into public.quiz_questions (id, kind, prompt)
select 'r' || lpad(n::text, 3, '0'), 'rate_it', e #>> '{}'
from jsonb_array_elements($j$[
  "Pineapple on pizza", "Karela", "Maggi at midnight", "Mondays", "Dhokla", "Biryani", "Chai", "Black coffee",
  "Dark chocolate", "Bhindi", "Paneer", "Momos", "Pani puri", "Jalebi", "Rasmalai", "Sushi",
  "Avocado toast", "Coconut water", "Green tea", "Cold coffee", "Gulab jamun", "Mango pickle", "Raw onion with food", "Boiled eggs",
  "Oats", "Salad as a meal", "Kaju katli", "Dosa", "Idli", "Upma", "Poha", "Rajma chawal",
  "Chole bhature", "Pav bhaji", "Vada pav", "Samosa", "Kachori", "Butter chicken", "Dal makhani", "Khichdi",
  "Curd rice", "Pasta", "Pizza", "Burgers", "French fries", "Ice cream in winter", "Hot soup in summer", "Very spicy food",
  "Very sweet chai", "Sugar-free sweets", "Energy drinks", "Lassi", "Buttermilk", "Paan", "Fried rice", "Hakka noodles",
  "Manchurian", "Shawarma", "Kebabs", "Garlic bread", "Popcorn", "Nachos", "Chocolate cake", "Cheesecake",
  "Waffles", "Cereal", "Peanut butter", "Nutella", "Ketchup on everything", "Coriander", "Mushrooms", "Brinjal",
  "Lauki", "Methi", "Sprouts", "Dry fruits", "Watermelon", "Papaya", "Jackfruit", "Litchi",
  "Guava with chilli salt", "Sugarcane juice", "Kulfi", "Falooda", "Street food in the rain", "Waking up at 5 a.m.", "Morning walks", "The gym",
  "Yoga", "Running", "Swimming", "Cycling", "Trekking", "Camping", "Road trips", "Long flights",
  "Train journeys", "Overnight buses", "Beach holidays", "Mountain holidays", "Museums", "Art galleries", "Zoos", "Theme parks",
  "Water parks", "Shopping malls", "Street markets", "Bargaining", "Online shopping", "Window shopping", "Cooking", "Baking",
  "Doing dishes", "Laundry", "Ironing", "Grocery shopping", "Cleaning the bathroom", "Making the bed", "Gardening", "Painting",
  "Dancing", "Singing", "Karaoke", "Clubbing", "House parties", "Weddings", "Family functions", "Surprise birthdays",
  "Video calls", "Voice notes", "Phone calls", "Texting", "Meetings", "Working from home", "Commuting", "Traffic",
  "Auto rides", "The metro", "Driving", "Being a passenger", "Sleeping in", "Afternoon naps", "Staying up late", "Reading",
  "Audiobooks", "Podcasts", "Board games", "Video games", "Card games", "Chess", "Crosswords", "Sudoku",
  "Watching cricket", "Watching football", "The IPL", "The Olympics", "Horror movies", "Romcoms", "Action movies", "Documentaries",
  "Anime", "K-dramas", "Reality shows", "Saas-bahu serials", "Bollywood dance numbers", "Sad songs", "Old Hindi songs", "Ghazals",
  "Rap", "EDM", "Classical music", "Live concerts", "Stand-up comedy", "Theatre plays", "Movie theatres", "Ads before videos",
  "Instagram reels", "Memes", "Selfies", "Couple photos", "Matching outfits", "PDA", "Pet names", "Surprise parties",
  "Planned dates", "Spontaneous trips", "Candlelight dinners", "Picnics", "Stargazing", "Sunrises", "Sunsets", "Rain",
  "Thunderstorms", "Summer heat", "Winter fog", "Monsoon", "Snow", "Humidity", "Air conditioning", "Blankets in summer",
  "Socks in bed", "Hot showers", "Cold showers", "Scented candles", "Fairy lights", "Indoor plants", "Cats", "Dogs",
  "Pet birds", "Fish tanks", "House lizards", "Spiders", "Long weekends", "Fridays", "Sundays", "Birthdays",
  "New Year's Eve", "Valentine's Day", "Diwali", "Holi", "Christmas", "Garba nights", "Rakhi", "Fireworks",
  "Cash as a gift", "Gift cards", "Handmade gifts", "Flowers as a gift", "Chocolates as a gift", "Jewellery", "Perfume", "Sneakers",
  "Heels", "Sarees", "Kurtas", "Suits", "Hoodies", "Pyjamas all day", "Dressing up", "Makeup",
  "Beards", "Moustaches", "Long hair", "Tattoos", "Piercings", "Nail art", "Sunglasses", "Hats",
  "Smartwatches", "Dark mode", "Group chats", "Family WhatsApp groups", "Good-morning forwards", "Read receipts", "Astrology", "Superstitions",
  "Room service", "Airport food", "Window seats", "Middle seats", "Roadside dhabas", "Fine dining", "Food delivery apps", "Cooking shows",
  "Recipe videos", "Self-help books", "Motivational quotes", "New Year resolutions", "To-do lists", "Budgets", "Saving money", "Credit cards",
  "Queues", "Small talk", "Big parties", "Quiet nights in", "Being alone", "Being the centre of attention", "Public speaking", "Surprises",
  "Pranks", "Puns", "Dad jokes", "Sarcasm", "Gossip", "Deep talks at 2 a.m.", "Long goodbyes", "Hugs",
  "Holding hands in public", "Forehead kisses", "Love letters", "Love songs", "Poetry", "Teddy bears", "Cheesy pickup lines", "Our first date",
  "Our first trip", "Our cooking together", "Our dance moves", "Our selfie skills", "Our planning skills", "Our communication", "Our movie choices", "Our road trip playlist"
]$j$::jsonb) with ordinality as t (e, n)
on conflict (id) do nothing;
