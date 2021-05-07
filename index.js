//Importing node modules: dotenv, MongoDB, got, express and public-ip
require('dotenv').config()
const {MongoClient} = require('mongodb')
const got = require('got');
const userIP = require('user-ip');
const prefix='https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=';
const uri=process.env.DATABASE_URL
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
//Connect to mongo client
(async()=>{
    await client.connect()
})()
//Stuff to set up express web server
//Express setup guide: https://expressjs.com/en/starter/hello-world.html
const express = require('express')
const app = express()
let port=process.env.PORT || 3000;
//Async function that computes the distance from a location to the user's current location
let getDistance=async(element, resourcesArray, origin)=>{
    const dest=element.address.split("#")[0]+" "+element.city
    //Uses the google maps API, the link to access the api is built here and accessed with the "got" package
    //Distance matrix API documentation https://developers.google.com/maps/documentation/distance-matrix/overview
    const response = await got(prefix+origin+'&destinations='+dest+'&key='+process.env.API_KEY).json();
    //Try to set the distance value to what is returned by the API, if it fails set it to 0
    let distance
    let value
    try{
        value=response.rows[0].elements[0].distance.value
        distance=response.rows[0].elements[0].distance.text
    }catch(err){
        value=0
        distance="Not found"
    }
    //Push all data about the resource as well as its distance from the user to a new array
    resourcesArray.push({...element, distance: distance, value: value})
 }
 //API endpoint which returns the data from mongoDB, sorted by increasing distance from user.
app.get('/dist/:query', async(req, res) => {
    let resourcesArray=[]
    try {
        //Get your ip address in order to get your location (long and lat)
        const ip= await userIP(req)
        console.log("IP", ip)
        const userLocation=await got("https://ipapi.co/"+ip+"/json/").json();
        const origin=userLocation.latitude+","+userLocation.longitude
        //Connect to the proper table based on your query (food, clothing or housing)
        let table=req.params.query
        let db = client.db('resources')
        if(req.params.query==='employment'){
            db = client.db('employment')
            let cursor = db.collection(table+'Info').find({});
            resourcesArray=await cursor.toArray()
        } else{
            let cursor = db.collection(table+'Info').find({});
            let tempArray=await cursor.toArray()
            //Instantiate a promises array. We are using a for loop to iterate through all the elements so this promise
            //array lets us do everything asynchronously (using await would make every request run one at a time instead of all at once,
            //which is super slow because the tables may have 50+ entries)
            //Info about promises: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
            let promises=[]
            for(let i=0;i<tempArray.length;i++){
                let element=tempArray[i]
                //Call our async function on line 21 and store in promises array
                promises.push(getDistance(element, resourcesArray, origin))
            }
            //Wait for all promises to execute
            //Promise.all documentation https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
            await Promise.all(promises)
            resourcesArray.sort((a, b) => (a.value > b.value) ? 1 : -1)
        }
	} catch (error) {
		console.log(error);
	}
    //Send completed array as response
    res.set('Access-Control-Allow-Origin', '*')
    res.send(resourcesArray)
})

 //API endpoint which returns the data from mongoDB unsorted
 app.get('/:query', async(req, res) => {
    let resourcesArray=[]
    try {
        //Connect to the proper table based on your query (food, clothing or housing)
        let table=req.params.query
        let db = client.db('resources')
        if(req.params.query==='employment')
            db = client.db('employment')
        let cursor = db.collection(table+'Info').find({});
        let tempArray=await cursor.toArray()
        tempArray.forEach(el=>{
            resourcesArray.push({...el, distance: "Use sort by location to view"})
        })
	} catch (error) {
		console.log(error);
	}
    //Send completed array as response
    res.set('Access-Control-Allow-Origin', '*')
    res.send(resourcesArray)
})

app.get("/", (req, res)=>{
    res.send("Please use a query such as food, housing or clothing")
})

app.listen(port, ()=>{
    console.log("Listening")
})
