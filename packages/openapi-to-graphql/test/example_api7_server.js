// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

const express = require('express')
const net = require('net')
const bodyParser = require('body-parser')
const { PubSub } = require('@graphql-mesh/utils');

const app = express()

let httpServer

const pubsub = new PubSub();

const Devices = {
  'Audio-player': {
    name: 'Audio-player',
    userName: 'johnny'
  },
  Drone: {
    name: 'Drone',
    userName: 'eric'
  }
}

/**
 * Starts the server at the given port
 */
function startServers(HTTP_PORT) {
  app.use(express.json())

  app.get('/api/user', (req, res) => {
    res.send({
      name: 'Arlene L McMahon'
    })
  })

  app.get('/api/devices', (req, res) => {
    res.status(200).send(Object.values(Devices))
  })

  app.post('/api/devices', (req, res) => {
    if (req.body.userName && req.body.name) {
      const device = req.body
      Devices[device.name] = device
      pubsub.publish(`webhook:post:/api/${device.userName}/devices/${req.method.toUpperCase()}`, device);
      res.status(200).send(device)
    } else {
      res.status(404).send({
        message: 'Wrong device schema'
      })
    }
  })

  app.get('/api/devices/:deviceName', (req, res) => {
    if (req.params.deviceName in Devices) {
      res.status(200).send(Devices[req.params.deviceName])
    } else {
      res.status(404).send({
        message: 'Wrong device ID.'
      })
    }
  })

  app.put('/api/devices/:deviceName', (req, res) => {
    if (req.params.deviceName in Devices) {
      if (req.body.userName && req.body.name) {
        const device = req.body
        delete Devices[req.params.deviceName]
        Devices[device.deviceName] = device
        pubsub.publish(`webhook:post:/api/${device.userName}/devices/${req.method.toUpperCase()}`, device);
        res.status(200).send(device)
      } else {
        res.status(404).send({
          message: 'Wrong device schema'
        })
      }
    } else {
      res.status(404).send({
        message: 'Wrong device ID.'
      })
    }
  })

  // mqttBroker.on('client', client => {
  //   console.log(`MQTT client connected`, client ? client.id : client)
  // })

  // mqttBroker.on('subscribe', (subscriptions, client) => {
  //   console.log(
  //     `MQTT client ${
  //       client ? client.id : client
  //     } subscribed to topic(s) ${subscriptions.map(s => s.topic).join('\n')}`
  //   )
  // })

  // mqttBroker.on('unsubscribe', (subscriptions, client) => {
  //   console.log(
  //     `MQTT client ${
  //       client ? client.id : client
  //     } unsubscribed from topic(s) ${subscriptions.join('\n')}`
  //   )
  // })

  return Promise.all([
    (httpServer = app.listen(HTTP_PORT)),
  ]).then(() => {
    console.log(`Example HTTP API accessible on port ${HTTP_PORT}`)
  })
}

/**
 * Stops server.
 */
function stopServers() {
  return Promise.all([
    httpServer.close()
  ]).then(() => {
    console.log(`Stopped HTTP API server`)
  })
}

// If run from command line, start server:
if (require.main === module) {
  startServers(3008)
}

module.exports = {
  startServers,
  stopServers,
  pubsub
}
