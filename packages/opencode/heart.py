import turtle


def draw_heart():
    turtle.bgcolor("white")
    turtle.color("red")
    turtle.fillcolor("red")
    turtle.pensize(3)
    turtle.speed(3)

    turtle.begin_fill()
    turtle.left(140)
    turtle.forward(180)
    turtle.circle(-90, 200)
    turtle.left(120)
    turtle.circle(-90, 200)
    turtle.forward(180)
    turtle.end_fill()

    turtle.hideturtle()
    turtle.done()


if __name__ == "__main__":
    draw_heart()
