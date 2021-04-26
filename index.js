const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

//const puppeteer = require('puppeteer'); questionable if this is necessary w/ the Apify include
const $ = require('cheerio');
const Apify = require('apify');
const { log } = Apify.utils;

log.setLevel(log.LEVELS.DEBUG);

//STATIC INFO
//SERIOUSEATS
const url = 'https://www.seriouseats.com/recipes';
const recipesPerSection = 3;
const dishTypesToVisit = ['Bread', 'Breakfast and Brunch', 'Burger', 'Pizza', 'Salads', 'Sandwiches', 'Sausage', 'Soups and Stews', 'Tacos'];
const validDietaryFlags = ['DAIRY-FREE', 'GLUTEN-FREE', 'VEGETARIAN', 'VEGAN'];

Apify.main(async() => {
	const input = await Apify.getValue('INPUT');

	const browser = await Apify.launchPuppeteer({ stealth: true });
	const page = await browser.newPage();
		
	//SERIOUSEATS SECTION
	await page.goto(url);

	var content = await page.content();

	var selector = '[data-title*="Dish Type"]';
	await page.waitForSelector(selector);
	await page.click(selector);

	//visit dishes through dish type
	await page.waitForSelector('c-mega-menu__menu'); //the menu we clicked
	content = await page.content(); //reinitialize content?

	$('h4.c-mega-menu__child-heading', content).each(function(o, sectionElem) { //iterate each heading
		const title = $(this).text();
		if(dishTypesToVisit.includes(title)) {
			await page.click($(this).parent()); //not sure if this works
			content = await page.content();
			$('article.c-card', content).each(function(i, elem) { //iterate each recipe listing
				if(i >= recipesPerSection) {
					return false; //break if we've visited enough as specified
				}
				await page.click($(this)); //sure hope this works 
				content = await page.content(); //this too, don't know about if it's necessary but it seems so?

				var recipeJson = {};
				var flags = [];
				var ingredients = [];
				//begin gathering recipe output elements
				const recipeTitle = $('h1.title.recipe-title', content).text(); 

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
				$('.recipe-ingredients').each(function(j, ingElem) {
					
				});

				//type is going to be irritating to evaluate, search entire page for terms ? probably too expensive, just don't collect ?

			});
		}
	});


	//clean up
	await page.close();
	await browser.close();
}