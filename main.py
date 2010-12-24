#!/usr/bin/env python
#
# Copyright 2007 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
from google.appengine.ext import webapp
from google.appengine.ext.webapp import util
from google.appengine.ext import db
from django.utils import simplejson

class Trip(db.Model):
    title = db.StringProperty(required=True)
    username = db.StringProperty()
    author = db.StringProperty()
    json = db.TextProperty(required=True)
    rating = db.IntegerProperty()
    date = db.DateTimeProperty(auto_now_add=True)

class TripListHandler(webapp.RequestHandler):
    def get(self):
        out = []
        for trip in Trip.all():
            out.append({
                'id': trip.key().id(),
                'title': trip.title,
                'rating': trip.rating,
                'author': trip.author
            })
            
        self.response.out.write(simplejson.dumps(out))

    def post(self):
        jsonString = self.request.get('json')
        print jsonString
        json = simplejson.loads(jsonString)
        
        # Title and JSON are required
        trip = Trip(title=json['title'],
                    json=jsonString)
                    
        # Add username
        if json.has_key('username'):
            trip.username = json['username']
        if json.has_key('name'):
            trip.author = json['name'];
        
        # Rating starts at 1
        trip.rating = 1
        
        trip.put()
        self.response.out.write('{"id": %s}' % trip.key().id())
        
class TripHandler(webapp.RequestHandler):
    def get(self, id):
        trip = Trip.get_by_id(int(id))
        
        self.response.out.write(trip.json)

class VoteHandler(webapp.RequestHandler):
    def post(self, id):
        trip = Trip.get_by_id(int(id))
        trip.rating += 1
        trip.put()
        
        self.response.out.write(trip.rating)

def main():
    application = webapp.WSGIApplication([('/trips/', TripListHandler),
                                          ('/trips/(.*)/', TripHandler),
                                          ('/vote/(.*)', VoteHandler)],
                                         debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
