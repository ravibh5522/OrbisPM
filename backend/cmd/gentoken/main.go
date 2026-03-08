package main

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func main() {
	// Generate two test user tokens
	users := []struct {
		ID    string
		Email string
	}{
		{ID: "11111111-1111-1111-1111-111111111111", Email: "alice@test.com"},
		{ID: "22222222-2222-2222-2222-222222222222", Email: "bob@test.com"},
	}

	secret := []byte("test-secret")

	for _, u := range users {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":   u.ID,
			"email": u.Email,
			"exp":   time.Now().Add(24 * time.Hour).Unix(),
			"iat":   time.Now().Unix(),
		})
		tokenStr, err := token.SignedString(secret)
		if err != nil {
			panic(err)
		}
		fmt.Printf("%s (%s):\n%s\n\n", u.Email, u.ID, tokenStr)
	}
}
