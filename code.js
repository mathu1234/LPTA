var dump1090link = "https://lpta.zapto.org/skyaware/"; //connects to skyaware on pi
//local pi ip http://192.168.0.212:8080/skyaware/
//ddns link https://lpta.zapto.org/skyaware/

//map api
var mapApi = "https://api.mapbox.com/styles/v1/mathu1234/clvbaw7dp00e901qzbsa07hc0/tiles/512/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWF0aHUxMjM0IiwiYSI6ImNsdmI2ZWgyODA1NWUycXAxNXZ5d3k5MzQifQ.ompn7kYJEKNj-KbROffL5g";

var startCoords = [53.406992110157645, -2.1306087586049767]; //map start coords
var zoom = 8; //zoom start value
var entities = new Map(); //map object to store hex as key and entity aircraft data as value
var dataUpdateTimer = 3000; //update every 3 second
var trackingTimer = 180000; //after 3 mins, stop tracking the aircraft
var landedTimer = 60000; //when plane has an altitude of 0, stop tracking after 1 min
var machToKnots = 666.739; //convert mach to knots to get speed

class Entity {
  lastUpdate = null; //last data update
  lastPosition = null; //last pos
  posHistory = []; 
  hex = null; //icao hex 
  aircraftType = null; //aircraft type from icao
  flight = null; //flight id
  heading = null; //aka direction
  speed = null; 
  altitude = null;
  squawk = null; //flight comms

  constructor(hex) { //creates entity for aircraft
    this.hex = hex;
    this.getData();
  }

  //use icao hex to get dump1090 data from link
  getData() {
    getAircraftData(this.hex, dump1090link).done(function(data) {
      if ("t" in data) {
        this.aircraftType = data.t.trim();
      }
      if ("desc" in data) {
        this.typeDescription = data.desc.trim();
      }
      if ("wtc" in data) {
        this.wtc = data.wtc.trim();
      }
    }.bind(this));
  }

  convert(a, getTime) { //convert data from dump1090 and then sort into preferred versions
    var prefAlt = a.alt_geom;
    if (a.alt_baro != null) {
      prefAlt = a.alt_baro;
    }

    var prefSpeed = null;
    if (a.mach != null) {
      prefSpeed = a.mach * machToKnots;
    }
    else if (a.tas != null) {
      prefSpeed = a.tas; //backup true airspeed
    }

    var prefHeading = a.track; 
    if (a.mag_heading != null) {
      prefHeading = a.mag_heading; //magnetic
    }
    if (a.true_heading != null) {
      prefHeading = a.true_heading; //true
    }
    
    //get the time data has been recived
    var seen = moment.unix(getTime).utc();
    if (a.seen != null) {
      seen = seen.subtract(a.seen, 'second');
    }

    this.lastUpdate = seen;

    var posSeen = null;
    if (a.lat != null) {
      posSeen = moment.unix(getTime).utc();
      if (a.seen_pos != null) {
        posSeen = posSeen.subtract(a.seen_pos, 'second');
      }
    }

    if (a.lat != null) {
      this.posUpdate(a.lat, a.lon);
    }

    if (posSeen != null) {
      this.lastPosition = posSeen;
    }

    if (prefAlt != null) {
      this.altitude = prefAlt;
    }

    if (a.mach != null) {
      this.speed = prefSpeed;
    }

    if (prefHeading != null) {
      this.heading = prefHeading;
    }

    if (a.flight != null) {
      this.flight = a.flight.trim();
    }

    if (a.squawk != null) {
      this.squawk = a.squawk;
    }
  }

  //get last pos
  position() {
    return this.posHistory[this.posHistory.length - 1];
  }

  //position update and putinto history
  posUpdate(lat, lon) {
    this.posHistory.push([lat, lon]);
  }

  //last altitude rounded
  getAltitude() {
    if (this.altitude != null) {
      return this.altitude.toFixed(0);
    } else {
      return null;
    }
  }

  //icon pos 
  iconPosition() {
    var pos = this.position();
    return pos;
  }

  //iconalt
  iconAltitude() {
    var alt = this.getAltitude();
    return alt;
  }
  
  //gen icon
  icon() {
    return L.icon({
        iconUrl: 'PLANE.png',
        iconSize: [40, 40], 
    });
}

  //place icon on map
  marker() {
    var pos = this.iconPosition();
    var icon = this.icon();
    if (pos != null && icon != null) { //check if pos and icon exist
      var m = L.marker(pos, {
        icon: icon,
      });
       return m;
    } else {
      return null;
    }
  }

  //check age of data / altitude
  dataCheck() {
    return (pctime().diff(this.lastUpdate) > trackingTimer
    || (this.iconAltitude() <= 0 && pctime().diff(this.lastUpdate) > landedTimer));
  }

  //aircraft id for table
  tableID() {
    if (this.hex != null) { //link to plane
      return "<a href='https://flightaware.com/live/modes/" + this.hex + "/redirect'>" + this.hex.toUpperCase() + "</a>"; 
    } else {
      return "N/A";
    }
  }

  //flight number
  tableFlight() {
    if (this.flight != null) { //link to flight
      return "<a href='https://flightaware.com/live/flight/" + this.flight + "'>" + this.flight.toUpperCase() + "</a>"; 
    } else {
      return "N/A";
    }
  }

  //type of aircraft
  tableType() {
    if (this.aircraftType != null) {
      return this.aircraftType; //use aircraft type from icao 
    } else {
      return "N/A";
    }
  }

  //squawk
  tableSquawk() {
    if (this.squawk != null) {
      return this.squawk; 
    } else {
      return "N/A";
    }
  }
   
  //latitude
  tableLat() {
    if (this.position() != null) {
      return this.position()[0].toFixed(3); //get lat pos from position() to 4 decimals
    } else {
      return "N/A";
    }
  }

  //longitude
  tableLon() {
    if (this.position() != null) {
      return this.position()[1].toFixed(3); //get lon pos from position() to 4 decimals
    } else {
      return "N/A";
    }
  }

  tableAlt() {
    if (this.getAltitude() != null) {
      return this.getAltitude(); 
    } else {
      return "N/A";
    }
  }

  tableHeading() {
    if (this.heading != null) {
      return this.heading; 
    } else {
      return "N/A";
    }
  }

  tableSpeed() {
    if (this.speed != null) {
      return this.speed.toFixed(0); 
    } else {
      return "N/A";
    }
  }
}

//get json data from skyaware
function skyawareRequest() {
  var url = dump1090link + "/data/aircraft.json?_=" + moment.unix().utc();
  $.ajax({ 
    url: url,
    dataType: 'json',
    timeout: 5000, //max response wait time of 5 secs
    success: async function(response) {
      requestPass(response);
    },
    error: function() {
      requestFail();
    },
    complete: function() {
      setTimeout(skyawareRequest, dataUpdateTimer); //request again after timer
    }
  });
}

async function requestPass(response) {
  $("span#tracker").html("Online and tracking " + response.aircraft.length + " aircraft"); //update tracker
  for (a of response.aircraft) { 
    if (!entities.has(a.hex)) { //does entities map have the hex, if no make one
      entities.set(a.hex, new Entity(a.hex, false)); 
    }
    entities.get(a.hex).convert(a, response.now);//gets hex from map, converts to prefered version of data
  }
}

async function requestFail() {
  $("span#tracker").html("Unable to connect"); 
}

function deleteAircraft() {
  entities.forEach(function(e) { //goes through map, checks if either landed or timer expired
    if (e.dataCheck()) {
      entities.delete(e.hex); //deletes from map
    }
  });
}

async function mapRefresh() {
  markersLayer.clearLayers(); //remove markers
  entities.forEach(function(e) { //check if entity has marker
    if (e.marker() != null) {//if none make and add
      markersLayer.addLayer(e.marker());
    }
  });
}

async function tableRefresh() {
  tableList = Array.from(entities.values());
  tableList.sort((a, b) => (a.hex > b.hex) ? 1 : -1); //sort data

  var table = $('<table>'); 
  table.addClass('tracktable');
  var headerFields = "<th>AIRCRAFT<br>ID</th><th>FLIGHT<br>NUMBER</th><th>SQUAWK<br>CODE</th><th>AIRCRAFT<br>TYPE</th><th>LATITUDE</th><th>LONITUDE</th><th>ALTITUDE<br>FT</th><th>DEGREeS<br>HEADING</th><th>KNOT<br>SPEED</th>";
  var header = $('<tr class="data">').html(headerFields);
  table.append(header);
  var rows = 0; 
  tableList.forEach(function(e) {

      var
      //aircraft id
      rowFields = "<td>" + e.tableID() + "</td>";
      //flight number
      rowFields += "<td>"+ e.tableFlight() + "</td>";
      //squawk
      rowFields += "<td>" + e.tableSquawk() + "</td>";
      //aircraft type
      rowFields += "<td>" + e.tableType() + "</td>";
      //latitude 
      rowFields += "<td>" + e.tableLat() + "</td>";
      //longitude      
      rowFields += "<td>" + e.tableLon() + "</td>";
      //altitude
      rowFields += "<td>" + e.tableAlt() + "</td>";
      //heading
      rowFields += "<td>" + e.tableHeading() + "</td>";
      //knotspeed
      rowFields += "<td>" + e.tableSpeed() + "</td>";

      var row = $('<tr name=' + e.hex + '>').html(rowFields);
      table.append(row);
      rows++;
  });
  if (rows == 0) {
    table.append($('<tr>').html("<td colspan=12><div class='tablenodata'>NO DATA</div></td>")); //if no data display no data
  }

  $('#tracktablearea').html(table);
}

async function updateAll() {
  deleteAircraft();
  mapRefresh();
  tableRefresh();
}

//current time get
function pctime() {
  return moment.unix().utc();
}

var map = L.map('map', { //initilise map
  zoomControl:false
})
map.setView(startCoords, zoom); //start with coords and zoom level

var markersLayer = new L.LayerGroup();
markersLayer.addTo(map); //adds planes

L.tileLayer(mapApi, { //loadmap from mapbox
}).addTo(map);


skyawareRequest();
setInterval(updateAll, 1000); //run every second up todate