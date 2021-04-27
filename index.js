const fs = require('fs');
const path = require('path');

//const puppeteer = require('puppeteer'); questionable if this is necessary w/ the Apify include
const $ = require('cheerio');
const Apify = require('apify');
const MongoClient = require('mongodb').MongoClient;
const { log } = Apify.utils;

log.setLevel(log.LEVELS.DEBUG);

//STATIC INFO
const waitLength = 2000; //how long to wait for resources to load; only used when waitForSelector isn't working... which is a lot 
//SERIOUSEATS
const url = 'https://www.seriouseats.com/recipes';
const recipesPerSection = 3;
const dishTypesToVisit = ['Bread', 'Breakfast and Brunch', 'Burger', 'Pizza', 'Salads', 'Sandwiches', 'Sausage', 'Soups and Stews', 'Tacos'];
const validDietaryFlags = ['DAIRY-FREE', 'GLUTEN-FREE', 'VEGETARIAN', 'VEGAN'];

//load mongodb atlas credentials
const atlasCredentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'credentials', 'mongoDBAtlas.json')));

//login to recipe database
let connectString = 'mongodb+srv://<username>:<password>@recipes.bfoel.mongodb.net/myFirstDatabase?retryWrites=true&w=majority';
connectString = connectString.replace('<username>', atlasCredentials['username']);
connectString = connectString.replace('<password>', atlasCredentials['password']);
MongoClient.connect(connectString, { useUnifiedTopology: true }, (err, client) => {
	if(err) {
		return console.error(err);
	}
	log.debug('DATABASE: Connected');
	const db = client.db('recipes');
	const recipesCollection = db.collection('recipes');

	//begin scraping bit
	Apify.main(async() => {
	const input = await Apify.getValue('INPUT');

	const browser = await Apify.launchPuppeteer({ stealth: true });
	const page = await browser.newPage();
		
	//SERIOUSEATS SECTION
	await page.goto(url);
	log.debug('SCRAPING: Navigated to page ' + url);

	var content = await page.content();

	var selector = '[data-title*="Dish Type"]';
	await page.waitForSelector(selector);
	await page.click(selector);
	log.debug('SCRAPING: Opened dish type menu');

	//visit dishes through dish type
	await page.waitFor(waitLength); //the menu we clicked
	content = await page.content(); //reinitialize content?
	log.debug('SCRAPING: Reloaded content var');

	$('h4.c-mega-menu__child-heading', content).each(async function(o, sectionElem) { //iterate each heading
		const title = $(this).text();
		if(dishTypesToVisit.includes(title)) {
			log.debug('SCRAPING: Visiting valid title (' + title + ')');
			log.debug($(this).parent());
			//it doesn't work — await page.click($(this).parent()); //not sure if this works 
			await page.goto($(this).parent().attr('href'));
			content = await page.content();
			$('article.c-card > a', content).each(async function(i, elem) { //iterate each recipe listing
				if(i >= recipesPerSection) {
					return false; //break if we've visited enough as specified
				}
				log.debug($(this));
				//sorry bud — await page.click($(this)); //sure hope this works 
				await page.goto($(this).attr('href'));
				content = await page.content(); //this too, don't know about if it's necessary but it seems so?

				var recipeJson = {};
				var flags = [];
				var ingredients = [];
				
				const recipeURL = await page.url(); //may not need to be "await"

				//begin gathering recipe output elements
				const recipeTitle = $('h1.title.recipe-title', content).text(); 

				log.debug('SCRAPING: Accessing recipe ( name = ' + recipeTitle + ')');

				//get dietaryFlags from breadcrumb list
				const breadcrumbList = $('ul.list-inline.list-categories.list-inverse', content).first();
				breadcrumbList.find('li.label.label-category.top-level > a > strong').each(function(j, flagElem) { //this selector is NOT questionable, I checked
					const bcText = $(this).text();
					if(validDietaryFlags.includes(bcText)) {
						flags.push(bcText);
					}
				}); 

				//get photo URL
				const recipeImgURL = $('.photo', content).attr('src'); //the photo class is seemingly only used for the first image... which is great for this but kinda strange

				//get ingredients 
				$('li.ingredient').each(function(j, ingElem) {
					ingredients.push($(this).text());
				});

				//type is going to be irritating to evaluate, search entire page for terms ? probably too expensive, just don't collect ?

				//place everything into object
				recipeJson['name'] = recipeTitle;
				recipeJson['type'] = "ANY"; 
				recipeJson['dietaryFlags'] = flags;
				recipeJson['image'] = recipeImgURL;
				recipeJson['link'] = recipeURL;
				recipeJson['ingredients'] = ingredients;

				log.debug(recipeJson);

				recipesCollection.insert(recipeJson, function(err, record) {
					if(err) { return console.error(err); }
					log.debug('placed recipe (name = ' + recipeTitle + ') into database.');
				});
			});
		}
		//RESET everything for next iteration 
		await page.goto(url);
		log.debug('SCRAPING: Navigated to page ' + url);

		content = await page.content();

		var selector = '[data-title*="Dish Type"]';
		await page.waitForSelector(selector);
		await page.click(selector);
		log.debug('SCRAPING: Opened dish type menu');

		//visit dishes through dish type
		await page.waitFor(waitLength); //the menu we clicked
		content = await page.content(); //reinitialize content?
		log.debug('SCRAPING: Reloaded content var');
	});


	//clean up
	await page.close();
	await browser.close();
	});
});

