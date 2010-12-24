var KMLBuilder = function() {
  this._tour = "";
  this._photos = "";
  this._coordinates = "";
  this._placemarks = "";
  this._distance = 0;
  // map of already visited places
  this._visited = {};
};

// Elevations in m
KMLBuilder.ALT_AIR = 80000;
KMLBuilder.ALT_SPACE = 3000000;
KMLBuilder.ALT_GROUND = 20000;

// Time in s
KMLBuilder.WAIT_START = 5;
KMLBuilder.WAIT_LAYOVER = 1.5;
KMLBuilder.WAIT_PLANE = 3;
KMLBuilder.WAIT_GROUND = 3;

// Speeds in km/s
KMLBuilder.SPEED_PLANE = 5000;
KMLBuilder.SPEED_TRAIN = 500;


KMLBuilder.prototype.build = function() {
  var template = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom"><Document><name>Tour</name><gx:Tour><name>Cool</name><gx:Playlist>%(body)s</gx:Playlist></gx:Tour>%(photos)s<Placemark><name>Path</name><LineString><extrude>1</extrude><tessellate>1</tessellate><coordinates>%(coordinates)s</coordinates></LineString><Style><LineStyle><color>ff0000ff</color><width>4</width></LineStyle></Style></Placemark>%(placemarks)s</Document></kml>';
  return format(template, {
    body: this._tour, 
    photos: this._photos, 
    coordinates: this._coordinates,
    placemarks: this._placemarks});
};

KMLBuilder.prototype.flyto = function(latlon, duration, altitude, heading, tilt) {
  duration = (duration == undefined ? 0 : duration);
  altitude = (altitude == undefined ? KMLBuilder.ALT_AIR: altitude);
  heading = (heading == undefined ? 0 : heading);
  tilt = (tilt == undefined ? 5 : tilt);
  var template = '<gx:FlyTo><gx:duration>%(duration)s</gx:duration><gx:flyToMode>smooth</gx:flyToMode><Camera><latitude>%(latitude)s</latitude><longitude>%(longitude)s</longitude><altitude>%(altitude)s</altitude><heading>%(heading)s</heading><tilt>%(tilt)s</tilt><roll>0</roll><altitudeMode>absolute</altitudeMode></Camera></gx:FlyTo>';
  this._tour += format(template, {
    latitude: latlon.lat(), 
    longitude: latlon.lon(),
    duration: duration,
    altitude: altitude,
    heading: heading,
    tilt: tilt
  });
  
  this._coordinates += latlon.lon() +',' + latlon.lat() + ',' + KMLBuilder.ALT_GROUND + ' ';
};

KMLBuilder.prototype.placemark = function(place) {
  var address = place.address;
  var latlon = place.latlon;
  if (this._visited[address]) {
    return;
  }
  this._visited[address] = true;
  var template = '<Placemark><name>%(address)s</name><Point><coordinates>%(longitude)s,%(latitude)s,0</coordinates></Point></Placemark>';
  this._placemarks += format(template, {
    address: address, 
    longitude: latlon.lon(), 
    latitude: latlon.lat()
  });
};

KMLBuilder.prototype.wait = function(duration) {
  var template = '<gx:Wait><gx:duration>%(duration)s</gx:duration></gx:Wait>';
  this._tour += format(template, {duration: duration});
};

KMLBuilder.prototype.distance = function() {
  return this._distance;
};

KMLBuilder.prototype.addDistance = function(d) {
  this._distance += parseInt(d, 10);
};

KMLBuilder.prototype.photo = function(latlon, url, title, aspectRatio, angle) {
  var width, height;
  // Google Earth has a weird aspect ratio, so scale by 4/3
  aspectRatio /= 0.75;
  if (aspectRatio < 1) {
    width = 0.07; height = parseFloat(width / aspectRatio);
  } else {
    height = 0.07; width = parseFloat(height * aspectRatio);
  }
  
  console.log("width: " + width + " height: " + height + ' aspectRatio: ' + aspectRatio);
  var template = "<GroundOverlay><name>%(title)s</name><Icon><href>%(url)s</href></Icon><LatLonBox><north>%(north)s</north><south>%(south)s</south><east>%(east)s</east><west>%(west)s</west><rotation>%(rotation)s</rotation></LatLonBox></GroundOverlay>";
  this._photos += format(template, {
    url: url,
    title: title,
    north: latlon.lat() + height,
    south: latlon.lat(),
    east: latlon.lon() + width,
    west: latlon.lon(),
    rotation: -angle
  });
};

// Python style string formatting
var format = function(string, params) {
  for (var param in params) {
    var re = new RegExp('%\\(' + param + '\\)s', 'g');
    string = string.replace(re, params[param]);
  }
  return string;
};

var capitalize = function(string) {
  return string.replace( /(^|\s)([a-z])/g , function(m,p1,p2){ return p1+p2.toUpperCase(); } );
};

KMLHelper = function(picasaUser) {
  this.geocoder = new google.maps.Geocoder();
  this.builder = new KMLBuilder();
  this.picasaUser = picasaUser;
};

// Use Google Maps API to resolve the address into a location
KMLHelper.prototype.geocode = function(address, callback) {
  var helper = this;
  this.geocoder.geocode({'address': address}, function(results, status) {
    if (status == 'OVER_QUERY_LIMIT') {
      // Try again later
      setTimeout(function() {
        helper.geocode(address, callback)
      }, 300);
    } else if (status == 'OK') {
      if (results.length) {
        var result = results[0];
        callback(result.geometry.location);
      }
    }
  });
};

// Given a data place at an index, create a KML tour element for it.
KMLHelper.prototype.processPlace = function(places, placeIndex) {
  var place = places[placeIndex];
  this.builder.placemark(place);
  var curr = place.latlon;
  // If at first point,
  if (placeIndex == 0) {
    // Put a waypoint, and wait extra long
    this.builder.flyto(curr, 0, KMLBuilder.ALT_GROUND);
    this.builder.wait(KMLBuilder.WAIT_START);
    return;
  }
  var prev = places[placeIndex - 1].latlon;
  // Compute the midpoint and quartiles
  var mid = curr.midpointTo(prev);
  var q1 = prev.midpointTo(mid);
  var e1 = prev.midpointTo(q1);
  var q2 = curr.midpointTo(mid);
  var e2 = curr.midpointTo(q2);
  // Compute the heading and distance
  var heading = prev.bearingTo(curr);
  var distance = prev.distanceTo(curr);
  // Compute duration of travel with train and plane modes
  var planeTime = Math.max(0.5, distance / KMLBuilder.SPEED_PLANE);
  var trainTime = Math.max(0.5, distance / KMLBuilder.SPEED_TRAIN);
  
  // add distance
  this.builder.addDistance(distance);
  
  var isPhotoAligned = false;
  switch (place.mode) {
    case "layover":
      this.builder.flyto(e1, planeTime, KMLBuilder.ALT_SPACE*7/8);
      this.builder.flyto(mid, planeTime, KMLBuilder.ALT_SPACE);
      this.builder.flyto(e2, planeTime, KMLBuilder.ALT_SPACE*7/8);
      this.builder.flyto(curr, planeTime, KMLBuilder.ALT_GROUND);
      this.builder.wait(KMLBuilder.WAIT_LAYOVER);
      break;
    case "plane":
      this.builder.flyto(e1, planeTime, KMLBuilder.ALT_SPACE*7/8);
      this.builder.flyto(mid, planeTime, KMLBuilder.ALT_SPACE);
      this.builder.flyto(e2, planeTime, KMLBuilder.ALT_SPACE*7/8);
      this.builder.flyto(curr, planeTime, KMLBuilder.ALT_GROUND);
      this.builder.wait(KMLBuilder.WAIT_PLANE);
      break;
    case "train":
    case "car":
      this.builder.flyto(prev, trainTime, KMLBuilder.ALT_AIR, heading, 20);
      this.builder.flyto(q1, trainTime, KMLBuilder.ALT_AIR, heading, 40);
      this.builder.flyto(e2, trainTime, KMLBuilder.ALT_AIR, heading, 20);
      this.builder.flyto(curr, trainTime, KMLBuilder.ALT_GROUND, heading);
      this.builder.wait(KMLBuilder.WAIT_GROUND);
      isPhotoAligned = true;
      break;
  }
  return {heading: (isPhotoAligned ? heading : 0)};
};

KMLHelper.prototype.getPersonalPhoto = function(place, angle, callback) {
  var picasaUrl = "https://picasaweb.google.com/data/feed/api/user/%(user)s?kind=photo&tag=%(tag)s&alt=json&callback=?";
  var url = format(picasaUrl, {user: this.picasaUser, tag: place.address});
  var builder = this.builder;
  $.getJSON(url, function(data) {
    var entries = data.feed.entry;
    if (entries && entries.length) {
      console.log('found photo for ' + place.address);
      // Get the first result
      var entry = entries[0];
      // Get aspect ratio from the data
      var aspectRatio = entry.gphoto$width.$t / entry.gphoto$height.$t;
      // Add the photo to the KML
      builder.photo(place.latlon, entry.content.src, place.address, aspectRatio, angle + (Math.random() * 2 - 1) * 10);
      
      if (entries.length > 1) {
        // Show the other photo as well
        var entry = entries[1];
        var nearby = new LatLon(place.latlon.lat(), place.latlon.lon()-0.1);
        var aspectRatio = entry.gphoto$width.$t / entry.gphoto$height.$t;
        builder.photo(nearby, entry.content.src, place.address + ' 2', aspectRatio, angle + (Math.random() * 2 - 1) * 10)
      }
    }
    callback();
  }); 
};

KMLHelper.prototype.getCommunityPhoto = function(place, angle, callback) {
  var picasaUrl = "https://picasaweb.google.com/data/feed/api/all?q=%(query)s&max-results=2&alt=json&callback=?";
  var url = format(picasaUrl, {query: place.address});
  var builder = this.builder;
  $.getJSON(url, function(data) {
    var entries = data.feed.entry;
    if (entries && entries.length) {
      console.log('found photo for ' + place.address);
      // Get the first result
      var entry = entries[0];
      // Get aspect ratio from the data
      var aspectRatio = entry.gphoto$width.$t / entry.gphoto$height.$t;
      // Add the photo to the KML
      builder.photo(place.latlon, entry.content.src, place.address, aspectRatio, angle + (Math.random() * 2 - 1) * 10);

      if (entries.length > 1) {
        // Show the other photo as well
        var entry = entries[1];
        var nearby = new LatLon(place.latlon.lat(), place.latlon.lon()-0.1);
        var aspectRatio = entry.gphoto$width.$t / entry.gphoto$height.$t;
        builder.photo(nearby, entry.content.src, place.address + ' 2', aspectRatio, angle + (Math.random() * 2 - 1) * 10)
      }
    }
    callback();
  });
};

KMLHelper.prototype.processData = function(data, callback) {
  // Generate KML first
  var builder = new KMLBuilder();
  var helper = this;
  (function(index) {
    var loop = arguments.callee;
    if (index < data.length) {
      var item = data[index];
      // Get geocode from Google
      helper.geocode(item.address, function(location) {
        // Add the latitude and longitude to the data
        item.latlon = new LatLon(location.lat(), location.lng());
        item.address = capitalize(item.address);
        // Add the waypoint to the KML
        var result = helper.processPlace(data, index);
        if (item.callback) {
          item.callback();
        }
        // Get the photo for the place
        var heading = result ? result.heading : 0;
        if (helper.picasaUser) {
          helper.getPersonalPhoto(item, heading, function() {
            loop(index + 1);
          });
        } else {
          helper.getCommunityPhoto(item, heading, function() {
            loop(index + 1);
          });
        }
      }); // end geocode
    } else {
      callback();
    }
  })(0);
};

KMLHelper.prototype.kml = function() {
  return this.builder.build();
};

KMLHelper.prototype.distance = function() {
  return this.builder.distance();
};
