package main

const configSchema = `
{
    "$schema": "http://json-schema.org/draft-05/schema#",
    "title": "Xonotic API configuration schema",
    "type": "object",
	"properties": {
		"servers": {
			"type": "object",
			"minProperties": 1,
			"patternProperties": {
				"[0-9A-Za-z]([0-9A-Za-z\\-\\._]*[0-9A-Za-z])?": {
					"$ref": "#/definitions/server"
				}
			}
		},
		"gamedb": {
			"type": "array",
			"minItems": 1,
			"items": {
				"type": "string",
				"minLength": 2
			}
		},
		"gamedir": {
			"type": "array",
			"minItems": 1,
			"items": {
				"type": "string",
				"minLength": 2
			}
		}
	},
    "additionalProperties": false,
	"required": ["servers", "gamedb"],
    "definitions": {
        "server": {
            "type": "object",
            "properties": {
                "server": {
                    "type": "string",
                    "anyOf": [
                        {"format": "ipv4"},
                        {"format": "ipv6"},
                        {"format": "hostname"}
                    ]
                },
                "port": {
                    "type": "number",
                    "minimum": 1,
                    "maximum": 65535,
                    "default": 26000
                },
                "rcon_mode": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 2,
                    "default": 1
                },
                "rcon_password": {
                    "type": "string",
                    "maxLength": 64,
                    "minLength": 1
                }
            },
            "required": ["server", "rcon_password"],
            "additionalProperties": false
        }
    }
}
`
