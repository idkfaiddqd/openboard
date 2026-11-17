/** Mapping is authored externally; semantic ID uniqueness is checked by core. */
export const mappingInputSchema = {
  "anyOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "sources",
        "sections"
      ],
      "properties": {
        "scope": {
          "type": "string"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "locator"
            ],
            "properties": {
              "locator": {
                "type": "string",
                "pattern": "\\S"
              },
              "repository": {
                "type": "string",
                "pattern": "\\S"
              },
              "revision": {
                "type": "string"
              },
              "description": {
                "type": "string"
              }
            }
          }
        },
        "sections": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "title",
              "entries"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "\\S"
              },
              "title": {
                "type": "string",
                "pattern": "\\S"
              },
              "entries": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "responsibility",
                    "artifacts",
                    "evidence",
                    "gaps"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "pattern": "\\S"
                    },
                    "responsibility": {
                      "type": "string",
                      "pattern": "\\S"
                    },
                    "explanation": {
                      "type": "string"
                    },
                    "artifacts": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "locator",
                          "participation"
                        ],
                        "properties": {
                          "locator": {
                            "type": "string",
                            "pattern": "\\S"
                          },
                          "repository": {
                            "type": "string",
                            "pattern": "\\S"
                          },
                          "revision": {
                            "type": "string"
                          },
                          "participation": {
                            "type": "string",
                            "pattern": "\\S"
                          },
                          "description": {
                            "type": "string"
                          }
                        }
                      }
                    },
                    "evidence": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "claim"
                        ],
                        "properties": {
                          "locator": {
                            "type": "string",
                            "pattern": "\\S"
                          },
                          "repository": {
                            "type": "string",
                            "pattern": "\\S"
                          },
                          "revision": {
                            "type": "string"
                          },
                          "claim": {
                            "type": "string",
                            "pattern": "\\S"
                          },
                          "method": {
                            "type": "string"
                          },
                          "limits": {
                            "type": "string"
                          }
                        }
                      }
                    },
                    "gaps": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "\\S"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      "type": "null"
    }
  ]
};
